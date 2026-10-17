// ejemplos/hola.ts — el hola mundo del SDK: tres preguntas al grafo por `sparql.consultar`, sin token, sin túnel y
// con el motor HTTP de siempre.
//
//   deno task hola
//
// El código no nombra ninguna clase del dominio: las clases salen de preguntarle al grafo cuáles tiene, y la
// instancia es la primera (por IRI) de la clase con más instancias. tests/hola.test.ts lo corre con un fetch falso y
// revisa que este archivo no nombre una clase de explorador/pruebas/datos/grafo.ttl.

import { type OpcionesSparql, sparql } from "../mod.ts";

/** Cuántas clases se listan y cuántas propiedades de la instancia se muestran. */
const CLASES = 8;
const PROPIEDADES = 12;

type Fila = Record<string, { type: string; value: string } | undefined>;

/** Corre un SELECT y devuelve sus filas (`results.bindings` del JSON de resultados). */
async function filas(consulta: string, opciones: OpcionesSparql): Promise<Fila[]> {
  const { texto } = await sparql.consultar(consulta, opciones);
  return JSON.parse(texto).results.bindings;
}

/** El nombre corto de un IRI: lo que sigue al último `#` o `/` (`https://x.dev/a#B` → `B`). */
export function corto(iri: string): string {
  return iri.slice(Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/")) + 1) || iri;
}

/** Un IRI que va dentro de `<…>` en una consulta. Viene del servidor, pero no se pega sin mirarlo. */
function enConsulta(iri: string): string {
  if (/[\s<>"{}|\\^`]/.test(iri)) throw new TypeError(`IRI que no se puede escribir en una consulta: ${iri}`);
  return `<${iri}>`;
}

/** Un valor de una fila, como se lee en la terminal: los IRIs por su nombre corto, los literales entre comillas. */
function valor(celda: { type: string; value: string }): string {
  if (celda.type === "uri") return corto(celda.value);
  const texto = celda.value.replace(/\s+/g, " ");
  return JSON.stringify(texto.length > 60 ? `${texto.slice(0, 59)}…` : texto);
}

/** Las líneas del hola mundo, en inglés. `opciones` pasa a cada `sparql.consultar` (url, fetch, timeoutMs). */
export async function hola(opciones: OpcionesSparql = {}): Promise<string[]> {
  const lineas: string[] = [];

  // 1. Cuántos hechos (triples) tiene el grafo.
  const [total] = await filas("SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }", opciones);
  lineas.push(`The graph has ${Number(total?.n?.value ?? 0)} facts (triples).`, "");

  // 2. Las clases que existen y cuántas instancias tiene cada una. El orden lo fija la consulta: más instancias
  //    primero, y a igual cantidad, por IRI.
  const clases = await filas(
    "SELECT ?clase (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s a ?clase } GROUP BY ?clase ORDER BY DESC(?n) ?clase",
    opciones,
  );
  const primeras = clases.slice(0, CLASES).filter((f) => f.clase && f.n);
  lineas.push(`Classes, by number of instances (top ${primeras.length} of ${clases.length}):`);
  const ancho = Math.max(0, ...primeras.map((f) => corto(f.clase!.value).length));
  for (const f of primeras) {
    const nombre = corto(f.clase!.value);
    lineas.push(`  ${f.n!.value.padStart(5)}  ${nombre.padEnd(ancho)}  ${f.clase!.value}`);
  }
  if (!primeras.length) return [...lineas, "  (none: the graph has no rdf:type statements)"];

  // 3. Una instancia cualquiera de la clase con más instancias (la primera por IRI) y sus propiedades.
  const clase = primeras[0].clase!.value;
  const [instancia] = await filas(`SELECT ?s WHERE { ?s a ${enConsulta(clase)} } ORDER BY ?s LIMIT 1`, opciones);
  const iri = instancia?.s?.value;
  if (!iri) return [...lineas, "", `No instance of ${corto(clase)} to show.`];
  const propiedades = await filas(`SELECT ?p ?o WHERE { ${enConsulta(iri)} ?p ?o } ORDER BY ?p ?o`, opciones);
  lineas.push("", `One ${corto(clase)}, and its properties:`, `  ${iri}`);
  const muestra = propiedades.slice(0, PROPIEDADES).filter((f) => f.p && f.o);
  const anchoP = Math.max(0, ...muestra.map((f) => corto(f.p!.value).length));
  for (const f of muestra) lineas.push(`    ${corto(f.p!.value).padEnd(anchoP)}  ${valor(f.o!)}`);
  if (propiedades.length > muestra.length) lineas.push(`    … and ${propiedades.length - muestra.length} more`);
  return lineas;
}

if (import.meta.main) {
  try {
    for (const linea of await hola()) console.log(linea);
  } catch (e) {
    console.error(`hello world failed: ${e instanceof Error ? e.message : e}`);
    Deno.exit(1);
  }
}
