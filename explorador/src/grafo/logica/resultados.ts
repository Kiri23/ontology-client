// Lo que devuelve el motor, en una forma que la vista sabe mostrar: filas (SELECT), sí o no (ASK) o tripletas
// (CONSTRUCT). Y de ahí, las filas de la Tabla del explorador y las IRIs a resaltar en el lienzo.
import type { Fila } from "../../logica/tabla.ts";
import { type Arista, idArista, type Modelo, type Termino, type Triple } from "./modelo.ts";
import { compacto, PREFIJOS, RDF_TYPE } from "./prefijos.ts";

export type Resultado =
  | { tipo: "filas"; columnas: string[]; filas: Map<string, Termino>[] }
  | { tipo: "si-no"; valor: boolean }
  | { tipo: "triples"; triples: Triple[] };

/** Copia plana de un término (los de oxigraph viven en la memoria del WASM). */
export function plano(t: Termino): Termino {
  return {
    termType: t.termType,
    value: t.value,
    ...(t.termType === "Literal" && t.datatype ? { datatype: { value: t.datatype.value } } : {}),
    ...(t.termType === "Literal" && t.language ? { language: t.language } : {}),
  };
}

const esTriple = (x: unknown): x is Triple => typeof x === "object" && x !== null && "subject" in x;

/** Lo que devolvió `store.query()`: boolean, Map[] o Quad[]. `variables` ordena las columnas (las del SELECT). */
export function leerResultado(crudo: unknown, variables: string[] = []): Resultado {
  if (typeof crudo === "boolean") return { tipo: "si-no", valor: crudo };
  const lista = Array.isArray(crudo) ? crudo : [];
  if (lista.length && esTriple(lista[0])) {
    return {
      tipo: "triples",
      triples: (lista as Triple[]).map((t) => ({
        subject: plano(t.subject),
        predicate: plano(t.predicate),
        object: plano(t.object),
      })),
    };
  }
  const filas = (lista as Map<string, Termino>[]).map((f) => new Map([...f].map(([k, v]) => [k, plano(v)])));
  const vistas = new Set(filas.flatMap((f) => [...f.keys()]));
  const columnas = [...variables.filter((v) => vistas.has(v)), ...[...vistas].filter((v) => !variables.includes(v))];
  return { tipo: "filas", columnas, filas };
}

const NUMEROS = new Set(["integer", "decimal", "double", "float", "long", "int"].map((t) => PREFIJOS.xsd + t));

/** Una celda: un nodo del grafo se lee por su etiqueta, otra IRI compacta, un número como número. */
function valor(t: Termino | undefined, m: Modelo): unknown {
  if (!t) return undefined;
  if (t.termType === "NamedNode") return m.nodos.get(t.value)?.etiqueta ?? compacto(t.value);
  if (t.termType === "Literal" && t.datatype && NUMEROS.has(t.datatype.value)) return Number(t.value);
  return t.value;
}

/** Las filas para la Tabla del explorador, con las columnas en el orden del SELECT. */
export function filasDeTabla(r: Extract<Resultado, { tipo: "filas" }>, m: Modelo): Fila[] {
  return r.filas.map((f) => Object.fromEntries(r.columnas.map((c) => [c, valor(f.get(c), m)])));
}

/** Las IRIs del resultado que son nodos del modelo: las que el lienzo resalta. */
export function nodosDelResultado(r: Resultado, m: Modelo): Set<string> {
  const iris = r.tipo === "filas"
    ? r.filas.flatMap((f) => [...f.values()])
    : r.tipo === "triples"
    ? r.triples.flatMap((t) => [t.subject, t.object])
    : [];
  return new Set(iris.filter((t) => t.termType === "NamedNode" && m.nodos.has(t.value)).map((t) => t.value));
}

/** Las variables de un SELECT en el orden en que se proyectan (`?a (COUNT(?b) AS ?n)` → a, n); `*` → []. */
export function variablesDelSelect(consulta: string): string[] {
  const proyeccion = /\bSELECT\s+(?:DISTINCT\s+|REDUCED\s+)?([^]*?)\s*(?:WHERE\b|\{)/i.exec(consulta)?.[1] ?? "";
  const sinExpresiones = proyeccion.replace(/\([^]*?\bAS\s+\?(\w+)\s*\)/gi, "?$1");
  return [...sinExpresiones.matchAll(/\?(\w+)/g)].map((m) => m[1]);
}

/** Lo que dibuja el lienzo de un CONSTRUCT: las IRIs como nodos y las tripletas IRI → IRI (sin rdf:type) como aristas. */
export function subgrafoDeTriples(triples: Triple[]): { nodos: string[]; aristas: Arista[] } {
  const nodos = new Set<string>();
  const aristas = new Map<string, Arista>();
  for (const t of triples) {
    if (t.subject.termType === "NamedNode") nodos.add(t.subject.value);
    if (t.object.termType !== "NamedNode" || t.predicate.value === RDF_TYPE) continue;
    nodos.add(t.object.value);
    const id = idArista(t.subject.value, t.predicate.value, t.object.value);
    aristas.set(id, { id, desde: t.subject.value, predicado: t.predicate.value, hasta: t.object.value });
  }
  return { nodos: [...nodos], aristas: [...aristas.values()] };
}
