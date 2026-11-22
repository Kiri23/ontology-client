// Para los tests: dice si dos textos Turtle son el mismo grafo, aunque cambien el orden, el formato o las etiquetas de
// los nodos en blanco. Lo usan graph.test.ts y model.test.ts.
//
// Un nodo en blanco se reconoce por lo que dice (sus triples, con sus nodos en blanco reconocidos igual, hacia
// adentro). Alcanza para las shapes SHACL, que son árboles; dos nodos en blanco que dicen lo mismo quedan iguales,
// que es lo que también diría un lector humano.

// @ts-types="@types/n3"
import { type Quad, type Term, termToId } from "n3";
import { assertEquals } from "@std/assert";
import { parseTurtle } from "../vocabulary/turtle.ts";

/**
 * Los triples del grafo, ordenados, con cada nodo en blanco cambiado por su contenido. Un nodo en blanco que nadie de
 * afuera apunta no entra: ese caso se cuenta aparte, con el tamaño del store.
 */
export function canonico(turtle: string): string[] {
  const { quads } = parseTurtle(turtle);
  const firma = (term: Term, camino: Set<string>): string => {
    if (term.termType !== "BlankNode") return termToId(term);
    if (camino.has(term.value)) return "[ciclo]";
    const adentro = new Set(camino).add(term.value);
    const lineas = quads.filter((q) => q.subject.equals(term)).map((q) =>
      `${termToId(q.predicate)} ${firma(q.object, adentro)}`
    );
    return `[${lineas.sort().join(" ; ")}]`;
  };
  const deAfuera = quads.filter((q: Quad) => q.subject.termType !== "BlankNode");
  return deAfuera.map((q) => `${termToId(q.subject)} ${termToId(q.predicate)} ${firma(q.object, new Set())}`).sort();
}

/** Falla, con la diferencia línea por línea, si los dos Turtle no son el mismo grafo. */
export function assertMismoGrafo(actual: string, esperado: string): void {
  assertEquals(canonico(actual), canonico(esperado));
}
