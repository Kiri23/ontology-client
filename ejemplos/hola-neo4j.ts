// ejemplos/hola-neo4j.ts — el hola mundo de la vista Neo4j: se conecta, le habla en Cypher con el driver tal
// cual, y después pide lo mismo por el SDK con el motor Neo4j.
//
//   ssh -N -L 7687:localhost:7687 -L 7474:localhost:7474 neo4j-ontology.exe.xyz     # el túnel, en otra pestaña
//   doppler run -p ontology -c dev -- deno task neo4j:hola
//
// NEO4J_URL es bolt://localhost:7687 si no se pasa; la password sale de NEO4J_PASSWORD (Doppler la inyecta).

import neo4j from "neo4j-driver";
import { configurar, jobs, motorHttp } from "../mod.ts";
import { motorNeo4j } from "../neo4j.ts";

const url = Deno.env.get("NEO4J_URL") || "bolt://localhost:7687";
const password = Deno.env.get("NEO4J_PASSWORD");
if (!password) {
  console.error("falta NEO4J_PASSWORD: corrélo con doppler run -p ontology -c dev -- deno task neo4j:hola");
  Deno.exit(2);
}

const driver = neo4j.driver(url, neo4j.auth.basic("neo4j", password));
try {
  // 1. El driver solo: ¿quién contesta?
  const info = await driver.getServerInfo();
  console.log(`conectado a ${info.address} (${info.agent})\n`);

  // 2. Cypher a mano: cuántos nodos hay de cada clase. Las clases RDF son labels acortados (ontologia:JobPost → ontologia__JobPost).
  const { records: clases } = await driver.executeQuery(
    `MATCH (n) UNWIND labels(n) AS clase WITH clase, count(*) AS n WHERE clase <> 'Resource' AND NOT clase STARTS WITH '_'
     RETURN clase, n ORDER BY n DESC LIMIT 8`,
    {},
    { routing: neo4j.routing.READ },
  );
  console.log("nodos por clase:");
  for (const r of clases) console.log(`  ${String(r.get("n")).padStart(4)}  ${r.get("clase")}`);

  // 3. Un puesto con las tecnologías que pide: un triple ontologia:pide es una arista.
  const { records: [puesto] } = await driver.executeQuery(
    `MATCH (p:ontologia__JobPost)-[:ontologia__pide]->(tecnologia:ontologia__Technology)
     RETURN p.rdfs__label[0] AS titulo, collect(tecnologia.skos__prefLabel[0]) AS pide LIMIT 1`,
    {},
    { routing: neo4j.routing.READ },
  );
  console.log(`\nun puesto: ${puesto.get("titulo")}\n  pide: ${puesto.get("pide").join(", ")}`);

  // 4. Lo mismo que el SDK le pide a HTTP, ahora a Neo4j: misma firma, otro motor.
  configurar({ motor: motorNeo4j(driver) });
  const python = await jobs.get({ tecnologia: "python" });
  console.log(`\njobs.get({ tecnologia: "python" }) por Neo4j: ${python.length} puestos`);
  for (const p of python.slice(0, 3)) {
    console.log(`  ${p.fecha.slice(0, 10)}  ${p.fuente.nombre.padEnd(12)} ${p.titulo.slice(0, 60)}`);
  }
} finally {
  configurar({ motor: motorHttp });
  await driver.close();
}
