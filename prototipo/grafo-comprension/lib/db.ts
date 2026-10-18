// db.ts — la conexión al Neo4j del prototipo (nunca al de producción) y una función para leer.
//
// NEO4J_URL default bolt://100.123.48.55:7688 (el proto por el tailnet; con túnel, bolt://localhost:7688),
// NEO4J_USER (neo4j) y NEO4J_PASSWORD, que inyecta `doppler run -p ontology -c dev --`. Solo lecturas.

import neo4j, { type Driver } from "neo4j-driver";

export const URL_NEO4J = Deno.env.get("NEO4J_URL") ?? "bolt://100.123.48.55:7688";

export type Fila = Record<string, unknown>;

export function abrir(): Driver {
  const puerto = new URL(URL_NEO4J).port;
  if (puerto === "" || puerto === "7687") {
    throw new Error(`${URL_NEO4J} es la vista RDF de producción, no el prototipo`);
  }
  const password = Deno.env.get("NEO4J_PASSWORD");
  if (!password) throw new Error("falta NEO4J_PASSWORD: corré con `doppler run -p ontology -c dev --`");
  return neo4j.driver(URL_NEO4J, neo4j.auth.basic(Deno.env.get("NEO4J_USER") ?? "neo4j", password), {
    disableLosslessIntegers: true,
  });
}

/** Una consulta de solo lectura; las filas como objetos planos. */
export async function leer(driver: Driver, cypher: string, parametros: Fila = {}): Promise<Fila[]> {
  const r = await driver.executeQuery(cypher, parametros, { routing: neo4j.routing.READ });
  return r.records.map((x) => x.toObject() as Fila);
}

/**
 * Una ruta como la escribió el humano ("Nodo.tsx", "grafo/vistas/Nodo.tsx") a la ruta exacta del grafo. Si hay varias
 * candidatas, las devuelve para que el que llama elija; si ninguna, lista vacía.
 */
export async function resolverRuta(driver: Driver, ruta: string): Promise<string[]> {
  const exacta = await leer(driver, "MATCH (a:Archivo {ruta: $ruta}) RETURN a.ruta AS ruta", { ruta });
  if (exacta.length) return [ruta];
  const sufijo = await leer(
    driver,
    "MATCH (a:Archivo) WHERE a.ruta ENDS WITH $ruta OR a.ruta CONTAINS $ruta RETURN a.ruta AS ruta ORDER BY size(a.ruta) LIMIT 8",
    { ruta },
  );
  return sufijo.map((f) => String(f.ruta));
}
