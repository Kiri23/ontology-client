// El validador de la consulta libre: corre antes del motor y explica cada rechazo en una frase. Es la costura donde
// después entra la AI (explorador/docs/consultas-por-ai.md, sección 5): lo que proponga un modelo pasa por acá.
//
// Rechaza: lo que no parsea, lo que cambia datos (INSERT, DELETE, LOAD…), lo que no es SELECT, ASK o CONSTRUCT,
// SERVICE y FROM, las clases (objetos de rdf:type) y propiedades que el grafo no tiene, y lo caro (costo.ts). Parsea con Traqula (el sucesor
// de sparqljs) y mira el álgebra, que ya trae las IRIs completas y las secuencias a/b como patrones sueltos.
import { toAlgebra } from "@traqula/algebra-sparql-1-1";
import { Parser } from "@traqula/parser-sparql-1-1";
import { motivosDeCosto } from "./costo.ts";
import { compacto, PREFIJOS, RDF_TYPE } from "./prefijos.ts";

/** Las IRIs que el grafo conoce, sacadas del Store con {@link CONSULTA_CLASES} y {@link CONSULTA_PROPIEDADES}. */
export interface Conocidas {
  clases: Set<string>;
  propiedades: Set<string>;
}

// Las usadas y también las declaradas en el esquema: ontologia:porque es una rdf:Property aunque ningún puesto la tenga todavía.
export const CONSULTA_CLASES = `SELECT DISTINCT ?c WHERE { { ?s a ?c } UNION { ?c a <${PREFIJOS.rdfs}Class> } }`;
export const CONSULTA_PROPIEDADES =
  `SELECT DISTINCT ?p WHERE { { ?s ?p ?o } UNION { ?p a <${PREFIJOS.rdf}Property> } }`;

export type Forma = "select" | "ask" | "construct";

export type Veredicto = { ok: true; forma: Forma } | { ok: false; motivos: string[] };

const FORMAS = new Set<string>(["select", "ask", "construct"]);

/** Las IRIs que usa la consulta, por rol. Exportada para las pruebas. */
export function irisDe(
  algebra: unknown,
): { clases: Set<string>; propiedades: Set<string>; service: boolean; from: boolean } {
  const salida = { clases: new Set<string>(), propiedades: new Set<string>(), service: false, from: false };
  const visitar = (x: unknown, clave = ""): void => {
    // La plantilla de un CONSTRUCT puede inventar predicados: es lo que devuelve, no lo que busca.
    if (!x || typeof x !== "object" || clave === "template") return;
    if (Array.isArray(x)) return x.forEach((y) => visitar(y));
    const nodo = x as Record<string, unknown> & { type?: string; termType?: string };
    if (nodo.termType === "Literal") return;
    if (nodo.type === "service") salida.service = true;
    if (nodo.type === "from") salida.from = true;
    if (nodo.type === "pattern" || nodo.type === "path") {
      const p = nodo.predicate as { termType?: string; value?: string } | undefined;
      const o = nodo.object as { termType?: string; value?: string } | undefined;
      if (p?.termType === "NamedNode") salida.propiedades.add(p.value!);
      if (p?.value === RDF_TYPE && o?.termType === "NamedNode") salida.clases.add(o.value!);
    }
    if (nodo.type === "link") salida.propiedades.add((nodo.iri as { value: string }).value);
    for (const [k, v] of Object.entries(nodo)) visitar(v, k);
  };
  visitar(algebra);
  return salida;
}

const local = (iri: string) => iri.replace(/^.*[#/]/, "").toLowerCase();

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

/** La IRI conocida más parecida (por el nombre local), si hay una razonablemente cerca. */
export function parecida(iri: string, conocidas: Set<string>): string | undefined {
  const buscado = local(iri);
  let mejor: { iri: string; d: number } | undefined;
  for (const c of conocidas) {
    const d = distancia(buscado, local(c)) - (c.startsWith(iri.replace(/[^#/]*$/, "")) ? 0.5 : 0);
    if (!mejor || d < mejor.d) mejor = { iri: c, d };
  }
  return mejor && mejor.d <= Math.max(2, buscado.length / 3) ? mejor.iri : undefined;
}

function noExiste(rol: "La clase" | "La propiedad", iri: string, conocidas: Set<string>): string {
  const otra = parecida(iri, conocidas);
  return `${rol} ${compacto(iri)} no existe en el grafo${otra ? `; parecida: ${compacto(otra)}` : ""}.`;
}

function motivoDeParseo(mensaje: string): string {
  const prefijo = /Unknown prefix: ([\w-]*)/.exec(mensaje)?.[1];
  if (prefijo !== undefined) {
    const base = PREFIJOS[prefijo];
    return base
      ? `Falta declarar el prefijo ${prefijo}:. Agregá arriba: PREFIX ${prefijo}: <${base}>`
      : `El prefijo ${prefijo}: no está declarado: agregá su línea PREFIX o escribí la IRI entera entre < >.`;
  }
  return `No se entiende la consulta: ${mensaje.split("\n")[0]}`;
}

/** El veredicto sobre una consulta: ok con su forma, o los motivos del rechazo (uno por problema). */
export function validar(consulta: string, conocidas: Conocidas): Veredicto {
  if (!consulta.trim()) return { ok: false, motivos: ["La consulta está vacía."] };
  let ast: { type?: string; subType?: string };
  try {
    ast = new Parser().parse(consulta) as typeof ast;
  } catch (e) {
    return { ok: false, motivos: [motivoDeParseo((e as Error).message)] };
  }
  if (ast.type === "update") {
    return {
      ok: false,
      motivos: ["Esto cambia datos (INSERT, DELETE, LOAD…) y acá solo se leen. Usá SELECT, ASK o CONSTRUCT."],
    };
  }
  if (!FORMAS.has(ast.subType ?? "")) {
    return {
      ok: false,
      motivos: [`${(ast.subType ?? "").toUpperCase()} no se corre acá: usá SELECT, ASK o CONSTRUCT.`],
    };
  }
  let algebra: unknown;
  try {
    algebra = toAlgebra(ast as Parameters<typeof toAlgebra>[0]);
  } catch (e) {
    return { ok: false, motivos: [`No se entiende la consulta: ${(e as Error).message}`] };
  }
  const usadas = irisDe(algebra);
  const motivos: string[] = [];
  if (usadas.service) motivos.push("SERVICE sale a otro servidor: acá solo se consulta el grafo cargado.");
  if (usadas.from) motivos.push("FROM elige otro grafo: acá hay uno solo, el que se cargó. Sacá el FROM.");
  motivos.push(...motivosDeCosto(algebra));
  for (const c of usadas.clases) if (!conocidas.clases.has(c)) motivos.push(noExiste("La clase", c, conocidas.clases));
  for (const p of usadas.propiedades) {
    if (!conocidas.propiedades.has(p)) motivos.push(noExiste("La propiedad", p, conocidas.propiedades));
  }
  return motivos.length ? { ok: false, motivos } : { ok: true, forma: ast.subType as Forma };
}
