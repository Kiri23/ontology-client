// neo4j-cargar.ts — rehace la vista Neo4j entera desde la fuente RDF, con neosemantics (n10s). Idempotente: borra
// todo y vuelve a importar, así que correrlo dos veces deja lo mismo.
//
//   doppler run -p ontology -c dev -- deno task neo4j:cargar [--sparql <url>]
//
// Una sola fuente, pública: el /sparql de producción (default), que sirve la unión de lo que lee GET /jobs. La vista
// carga solo DATOS (PATRON_DATOS): Neo4j no razona sobre el esquema, cada dato ya trae su clase como label, y el
// esquema (clases, propiedades, shapes) vive en el RDF. Un solo n10s.rdf.import.fetch: Neo4j baja el CONSTRUCT
// solo. Nada de acá escribe un nodo o una propiedad por su cuenta, salvo el centinela de carga completa.
// Los named graphs se aplanan a la unión, como los lee el servidor (neo4j/README.md dice qué se pierde).
//
// La conexión: NEO4J_URL (default bolt://localhost:7687, el túnel ssh), NEO4J_USER (neo4j) y NEO4J_PASSWORD.
// Antes de borrar nada, la fuente tiene que responder. Al final verifica que el import terminó OK y que entraron
// todos los triples que la fuente dice tener, y recién ahí deja el centinela (:_Carga {completa: true}) que
// motorNeo4j exige: una carga cortada a la mitad no se lee como una vista vacía.

import { parseArgs } from "@std/cli/parse-args";
import neo4j, { type Driver } from "neo4j-driver";
import { URL_PRODUCCION } from "../cliente.ts";
import { CENTINELA, CONFIG_N10S, PREFIJOS } from "../vista-neo4j.ts";

/** Las clases de esquema: lo que es instancia de una de estas no entra a la vista. */
const ESQUEMA = [
  "rdfs:Class",
  "rdf:Property",
  "owl:Class",
  "owl:ObjectProperty",
  "owl:DatatypeProperty",
  "sh:NodeShape",
  "sh:PropertyShape",
];

/**
 * Los datos: cada triple cuyo sujeto es instancia de una clase que no es de esquema. Hoy entran j:JobPost,
 * t:Technology, doap:Project, k:Uso, k:Workflow y k:Action. Quedan afuera el esquema y las shapes (con sus blank
 * nodes) y los nodos de named graph (urn:kiri-*, sin tipo: el puesto ya lleva su fuente y su fecha).
 */
export const PATRON_DATOS = `?s a ?c . FILTER(?c NOT IN (${ESQUEMA.join(", ")})) ?s ?p ?o`;

const PREFIJOS_SPARQL = [
  "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
  "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
  "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
  "PREFIX sh: <http://www.w3.org/ns/shacl#>",
].join("\n");

interface Import {
  terminationStatus: string;
  triplesLoaded: number;
  triplesParsed: number;
  extraInfo: string;
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, { string: ["sparql"], default: { sparql: `${URL_PRODUCCION}/sparql` } });
  const driver = neo4j.driver(
    Deno.env.get("NEO4J_URL") || "bolt://localhost:7687",
    neo4j.auth.basic(Deno.env.get("NEO4J_USER") || "neo4j", Deno.env.get("NEO4J_PASSWORD") ?? ""),
  );
  try {
    console.log(`carga completa: ${await cargar(driver, args.sparql)} triples`);
  } finally {
    await driver.close();
  }
}

/**
 * La carga entera. Lo que puede fallar sin tocar la vista va antes de vaciarla: que la fuente responda y diga
 * cuántos triples tiene. El centinela va al final, solo si todo entró: una carga que se corta deja la vista sin él,
 * y motorNeo4j no la lee. Devuelve los triples cargados.
 */
export async function cargar(driver: Driver, sparql: string, pedir: typeof fetch = fetch): Promise<number> {
  const esperados = await contar(sparql, pedir);
  await vaciar(driver);
  const construct = `${sparql}?query=${
    encodeURIComponent(`${PREFIJOS_SPARQL}\nCONSTRUCT { ?s ?p ?o } WHERE { ${PATRON_DATOS} }`)
  }`;
  const datos = await importar(driver, "CALL n10s.rdf.import.fetch($url, 'Turtle', $opciones)", {
    url: construct,
    opciones: { headerParams: { Accept: "text/turtle" } },
  });
  const triples = revisar(sparql, datos, esperados);
  await escribir(driver, `CREATE (:${CENTINELA} {completa: true, cuando: datetime(), triples: $triples})`, {
    triples,
  });
  return triples;
}

// Borra la vista entera y la prepara de nuevo: primero el centinela (desde acá, la vista no está cargada), después
// los nodos, la config de n10s y los prefijos (que también son nodos); la constraint de n10s, CONFIG_N10S y los
// PREFIJOS, antes del fetch: así cada namespace de los datos queda con un prefijo legible y no con un nsN.
async function vaciar(driver: Driver): Promise<void> {
  await escribir(driver, `MATCH (c:${CENTINELA}) DELETE c`);
  await escribir(driver, "MATCH (n) DETACH DELETE n");
  await escribir(driver, "CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE");
  await escribir(driver, "CALL n10s.graphconfig.init($config)", { config: CONFIG_N10S });
  for (const [prefijo, ns] of Object.entries(PREFIJOS)) {
    await escribir(driver, "CALL n10s.nsprefixes.add($prefijo, $ns)", { prefijo, ns });
  }
}

async function escribir(driver: Driver, cypher: string, parametros: Record<string, unknown> = {}): Promise<void> {
  await driver.executeQuery(cypher, parametros, { routing: neo4j.routing.WRITE });
}

async function importar(driver: Driver, cypher: string, parametros: Record<string, unknown>): Promise<Import> {
  const { records } = await driver.executeQuery(cypher, parametros, { routing: neo4j.routing.WRITE });
  const r = records[0];
  return {
    terminationStatus: r.get("terminationStatus"),
    triplesLoaded: Number(r.get("triplesLoaded")),
    triplesParsed: Number(r.get("triplesParsed")),
    extraInfo: r.get("extraInfo"),
  };
}

// Cuántos triples distintos tiene la fuente con el mismo patrón del CONSTRUCT: el número que tiene que entrar. DISTINCT
// porque COUNT(*) cuenta soluciones: un triple en dos named graphs sale dos veces, y el CONSTRUCT lo da una.
async function contar(sparql: string, pedir: typeof fetch): Promise<number> {
  const query =
    `${PREFIJOS_SPARQL}\nSELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { ${PATRON_DATOS} } }`;
  const r = await pedir(`${sparql}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/sparql-results+json" },
  });
  if (!r.ok) throw new Error(`${sparql}: HTTP ${r.status} al contar los triples`);
  const n = Number((await r.json())?.results?.bindings?.[0]?.n?.value);
  if (!Number.isInteger(n)) throw new Error(`${sparql}: la cuenta de triples no vino como un número`);
  return n;
}

// Un import que no terminó OK, o que cargó menos de lo que leyó (o de lo que la fuente dice tener), corta la carga.
// Devuelve los triples cargados.
function revisar(origen: string, i: Import, esperados = i.triplesParsed): number {
  const linea = `${origen}: ${i.terminationStatus}, ${i.triplesLoaded} de ${i.triplesParsed} triples`;
  if (i.terminationStatus !== "OK" || i.triplesLoaded !== i.triplesParsed || i.triplesParsed !== esperados) {
    throw new Error(`${linea} (la fuente dice ${esperados}) ${i.extraInfo}`.trim());
  }
  console.log(linea);
  return i.triplesLoaded;
}

if (import.meta.main) await main();
