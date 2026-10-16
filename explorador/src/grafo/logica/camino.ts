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

/** Lo que muestra el lienzo del stepper: el inicio, y por cada salto sus aristas y sus vecinos, en orden. */
export function subgrafo(m: Modelo, inicio: string, saltos: Salto[]): { nodos: string[]; aristas: Arista[] } {
  const nodos = new Set(m.nodos.has(inicio) ? [inicio] : []);
  const aristas = new Map<string, Arista>();
  for (const s of saltos) {
    if (!nodos.has(s.desde)) continue; // un salto desde un nodo que no está en el lienzo no vale (URL editada a mano)
    for (const a of aristasDelSalto(m, s)) {
      aristas.set(a.id, a);
      nodos.add(a.desde).add(a.hasta);
    }
  }
  return { nodos: [...nodos], aristas: [...aristas.values()] };
}

const termino = (iri: string) => compacto(iri);

/**
 * El SPARQL que reproduce el lienzo: un CONSTRUCT con una rama de UNION por salto, en el orden en que se dieron.
 * Sin saltos, la ficha del nodo (lo que sale de él).
 */
export function sparqlDelCamino(m: Modelo, inicio: string, saltos: Salto[]): string {
  const nombre = (iri: string) => m.nodos.get(iri)?.etiqueta ?? iri;
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
