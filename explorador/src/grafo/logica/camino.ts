// El camino del stepper: un nodo de inicio y los saltos que se fueron dando (desde qué nodo, por qué predicado, en qué
// dirección). De ahí salen el subgrafo que muestra el lienzo, el SPARQL que lo reproduce y cómo va en la URL.
import { compacto, declaraciones } from "./prefijos.ts";
import type { Arista, Modelo } from "./modelo.ts";
import type { Direccion } from "./relaciones.ts";

export interface Salto {
  desde: string;
  predicado: string;
  direccion: Direccion;
}

// En la URL: un salto por línea, `desde > predicado` o `desde < predicado`. Las IRIs no llevan espacios.
const SEPARADOR = { sale: ">", entra: "<" } as const;

export function escribirSaltos(saltos: Salto[]): string {
  return saltos.map((s) => `${s.desde} ${SEPARADOR[s.direccion]} ${s.predicado}`).join("\n");
}

/** Lo inverso de {@link escribirSaltos}. Una línea que no tiene esa forma se ignora. */
export function leerSaltos(texto: string | undefined): Salto[] {
  const saltos: Salto[] = [];
  for (const linea of (texto ?? "").split("\n")) {
    const [desde, signo, predicado, ...resto] = linea.trim().split(/\s+/);
    if (!desde || !predicado || resto.length || (signo !== ">" && signo !== "<")) continue;
    saltos.push({ desde, predicado, direccion: signo === ">" ? "sale" : "entra" });
  }
  return saltos;
}

/** Las aristas que trae un salto: las del predicado que salen de (o entran a) su nodo. */
function aristasDelSalto(m: Modelo, s: Salto): Arista[] {
  return m.aristas.filter((a) =>
    a.predicado === s.predicado && (s.direccion === "sale" ? a.desde === s.desde : a.hasta === s.desde)
  );
}

/**
 * Los saltos que valen, en orden: los que salen de un nodo que ya está en el lienzo y traen al menos una arista. Los
 * demás (una URL editada a mano) no agregan nada ni al lienzo ni al SPARQL. El inicio tiene que ser un nodo del grafo.
 */
export function saltosValidos(m: Modelo, inicio: string, saltos: Salto[]): { salto: Salto; aristas: Arista[] }[] {
  const nodos = new Set(m.nodos.has(inicio) ? [inicio] : []);
  const validos: { salto: Salto; aristas: Arista[] }[] = [];
  for (const salto of saltos) {
    const aristas = nodos.has(salto.desde) ? aristasDelSalto(m, salto) : [];
    if (!aristas.length) continue;
    for (const a of aristas) nodos.add(a.desde).add(a.hasta);
    validos.push({ salto, aristas });
  }
  return validos;
}

/** Lo que muestra el lienzo del stepper: el inicio, y por cada salto válido sus aristas y sus vecinos, en orden. */
export function subgrafo(m: Modelo, inicio: string, saltos: Salto[]): { nodos: string[]; aristas: Arista[] } {
  const nodos = new Set(m.nodos.has(inicio) ? [inicio] : []);
  const aristas = new Map<string, Arista>();
  for (const v of saltosValidos(m, inicio, saltos)) {
    for (const a of v.aristas) {
      aristas.set(a.id, a);
      nodos.add(a.desde).add(a.hasta);
    }
  }
  return { nodos: [...nodos], aristas: [...aristas.values()] };
}

const termino = (iri: string) => compacto(iri);

/**
 * El SPARQL que reproduce el lienzo: un CONSTRUCT con una rama de UNION por salto válido, en el orden en que se dieron.
 * Sin saltos, la ficha del nodo (lo que sale de él). Si el inicio no es un nodo del grafo, "" (no hay camino).
 * Las etiquetas van en comentarios `#`: un salto de línea en una (los títulos de HN vienen de afuera) cerraría el
 * comentario y lo que sigue sería SPARQL. Por eso cada espacio en blanco, saltos incluidos, queda como un espacio.
 */
export function sparqlDelCamino(m: Modelo, inicio: string, todos: Salto[]): string {
  if (!m.nodos.has(inicio)) return "";
  const saltos = saltosValidos(m, inicio, todos).map((v) => v.salto);
  const nombre = (iri: string) => (m.nodos.get(iri)?.etiqueta ?? iri).replace(/\s+/g, " ");
  let cuerpo: string;
  if (!saltos.length) {
    cuerpo = `# La ficha de ${nombre(inicio)}: lo que sale de él.\n` +
      `CONSTRUCT { ${termino(inicio)} ?p ?o . }\nWHERE { ${termino(inicio)} ?p ?o . }`;
  } else {
    const patrones = saltos.map((s, i) => {
      const v = `?n${i + 1}`;
      return s.direccion === "sale"
        ? `${termino(s.desde)} ${termino(s.predicado)} ${v} .`
        : `${v} ${termino(s.predicado)} ${termino(s.desde)} .`;
    });
    const ramas = saltos.map((s, i) =>
      `  # Salto ${i + 1}: ${s.direccion === "sale" ? "lo que" : "lo que apunta a"} ${nombre(s.desde)} ` +
      `${s.direccion === "sale" ? "tiene por" : "por"} ${termino(s.predicado)}\n  { ${patrones[i]} }`
    );
    cuerpo = `CONSTRUCT {\n${patrones.map((p) => `  ${p}`).join("\n")}\n}\nWHERE {\n${ramas.join("\n  UNION\n")}\n}`;
  }
  return declaraciones(cuerpo) + cuerpo;
}
