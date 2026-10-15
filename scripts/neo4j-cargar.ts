// neo4j-cargar.ts — rehace la vista Neo4j entera desde la fuente RDF, con neosemantics (n10s). Idempotente: borra
// todo y vuelve a importar, así que correrlo dos veces deja lo mismo.
//
//   doppler run -p ontology -c dev -- deno task neo4j:cargar --domain <ontologyLearning>/domain
//
// Dos fuentes, las dos RDF; nada de acá escribe un nodo o una propiedad por su cuenta:
//   --domain <dir>   cada .ttl del directorio (domain/ de ontologyLearning, privado): va inline, n10s.rdf.import.inline.
//   --sparql <url>   los named graphs de producción y la metadata de cada grafo, con un CONSTRUCT: Neo4j lo baja
//                    solo, n10s.rdf.import.fetch. Default el /sparql público de producción.
// Los named graphs se aplanan a la unión, como los lee el servidor (neo4j/README.md dice qué se pierde).
//
// La conexión: NEO4J_URL (default bolt://localhost:7687, el túnel ssh), NEO4J_USER (neo4j) y NEO4J_PASSWORD.
// Antes de borrar nada, la fuente tiene que responder. Al final verifica que cada import terminó OK y que entraron
// todos los triples que la fuente dice tener, y recién ahí deja el centinela (:_Carga {completa: true}) que
// motorNeo4j exige: una carga cortada a la mitad no se lee como una vista vacía.

import { parseArgs } from "@std/cli/parse-args";
import neo4j, { type Driver } from "neo4j-driver";
import { URL_PRODUCCION } from "../cliente.ts";
import { CENTINELA, CONFIG_N10S, PREFIJOS } from "../vista-neo4j.ts";

/**
 * Lo que se baja de producción: el contenido de cada named graph y los triples sobre cada grafo (dct:source,
 * prov:generatedAtTime, rdfs:comment), que viven en el default graph. Lo escrito a mano (A_MANO) no: también está
 * en el default graph, pero entra desde --domain, y entrar dos veces duplicaría sus blank nodes.
 */
export const PATRON_PRODUCCION =
  "{ GRAPH ?g { ?s ?p ?o } } UNION { { SELECT DISTINCT ?s WHERE { GRAPH ?s { ?x ?y ?z } } } ?s ?p ?o }";

interface Import {
  terminationStatus: string;
  triplesLoaded: number;
  triplesParsed: number;
  extraInfo: string;
}

/** Un .ttl de domain/, ya leído. */
export interface Archivo {
  nombre: string;
  texto: string;
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["domain", "sparql"],
    default: { sparql: `${URL_PRODUCCION}/sparql` },
  });
  if (!args.domain) throw new Error("falta --domain <dir>: el domain/ de ontologyLearning, con sus .ttl");
  const archivos = await Promise.all(
    (await ttlDe(args.domain)).map(async (nombre) => ({ nombre, texto: await Deno.readTextFile(nombre) })),
  );
  const driver = neo4j.driver(
    Deno.env.get("NEO4J_URL") || "bolt://localhost:7687",
    neo4j.auth.basic(Deno.env.get("NEO4J_USER") || "neo4j", Deno.env.get("NEO4J_PASSWORD") ?? ""),
  );
  try {
    console.log(`carga completa: ${await cargar(driver, archivos, args.sparql)} triples`);
  } finally {
    await driver.close();
  }
}

/**
 * La carga entera. Lo que puede fallar sin tocar la vista va antes de vaciarla: leer domain/ (lo hace quien llama) y
 * que la fuente responda y diga cuántos triples tiene. El centinela va al final, solo si todo entró: una carga que
 * se corta deja la vista sin él, y motorNeo4j no la lee. Devuelve los triples cargados.
 */
export async function cargar(
  driver: Driver,
  archivos: readonly Archivo[],
  sparql: string,
  pedir: typeof fetch = fetch,
): Promise<number> {
  const esperados = await contar(sparql, pedir);
  await vaciar(driver);
  let triples = 0;
  for (const { nombre, texto } of archivos) {
    await escribir(driver, "CALL n10s.nsprefixes.addFromText($texto)", { texto });
    triples += revisar(nombre, await importar(driver, "CALL n10s.rdf.import.inline($texto, 'Turtle')", { texto }));
  }
  const construct = `${sparql}?query=${encodeURIComponent(`CONSTRUCT { ?s ?p ?o } WHERE { ${PATRON_PRODUCCION} }`)}`;
  const prod = await importar(driver, "CALL n10s.rdf.import.fetch($url, 'Turtle', $opciones)", {
    url: construct,
    opciones: { headerParams: { Accept: "text/turtle" } },
  });
  triples += revisar(sparql, prod, esperados);
  await escribir(driver, `CREATE (:${CENTINELA} {completa: true, cuando: datetime(), triples: $triples})`, {
    triples,
  });
  return triples;
}

// Los .ttl de un directorio, ordenados: el orden fija qué prefijo nsN le toca a un namespace sin prefijo propio.
async function ttlDe(dir: string): Promise<string[]> {
  const nombres: string[] = [];
  for await (const e of Deno.readDir(dir)) if (e.isFile && e.name.endsWith(".ttl")) nombres.push(e.name);
  if (!nombres.length) throw new Error(`${dir}: no tiene ningún .ttl`);
  return nombres.sort().map((n) => `${dir}/${n}`);
}

// Borra la vista entera y la prepara de nuevo: primero el centinela (desde acá, la vista no está cargada), después
// los nodos, la config de n10s y los prefijos (que también son nodos); la constraint de n10s, CONFIG_N10S y los
// PREFIJOS que nombra la consulta del motor.
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
  const query = `SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { ${PATRON_PRODUCCION} } }`;
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
