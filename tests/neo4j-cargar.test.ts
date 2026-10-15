// Tests de cargar() (scripts/neo4j-cargar.ts) con un Driver y un fetch falsos: no tocan la red. Lo que prueban es el
// orden: nada se borra si la fuente no responde, y el centinela de carga completa va al final, solo si todo entró.

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import type { Driver } from "neo4j-driver";
import { cargar } from "../scripts/neo4j-cargar.ts";

const SPARQL = "https://fuente.invalid/sparql";

// Un Driver que anota cada Cypher (con sus parámetros) y responde al import con `estado` y `triples`.
function driverFalso(prod: { estado?: string; triples?: number } = {}) {
  const cypher: string[] = [];
  const parametros: Record<string, unknown>[] = [];
  const driver = {
    executeQuery: (q: string, p: Record<string, unknown>) => {
      cypher.push(q);
      parametros.push(p);
      const triples = prod.triples ?? 1204;
      const valores: Record<string, unknown> = {
        terminationStatus: prod.estado ?? "OK",
        triplesLoaded: triples,
        triplesParsed: triples,
        extraInfo: "",
      };
      return Promise.resolve({ records: q.includes("import") ? [{ get: (k: string) => valores[k] }] : [] });
    },
  } as unknown as Driver;
  return { driver, cypher, parametros };
}

// Un fetch que responde la cuenta de triples de la fuente, y guarda la query.
function fuente(n: number) {
  const vistas: string[] = [];
  const pedir = (url: string | URL | Request) => {
    vistas.push(new URL(String(url)).searchParams.get("query") ?? "");
    return Promise.resolve(Response.json({ results: { bindings: [{ n: { value: String(n) } }] } }));
  };
  return { pedir: pedir as typeof fetch, vistas };
}

Deno.test("cargar: si la fuente no responde, no borra nada", async () => {
  const { driver, cypher } = driverFalso();
  const caida = () => Promise.reject(new TypeError("error sending request: connection refused"));
  await assertRejects(() => cargar(driver, SPARQL, caida as typeof fetch), TypeError, "connection refused");
  assertEquals(cypher, []);
  const { driver: d2, cypher: c2 } = driverFalso();
  const http500 = () => Promise.resolve(new Response("caído", { status: 500 }));
  await assertRejects(() => cargar(d2, SPARQL, http500 as typeof fetch), Error, "HTTP 500");
  assertEquals(c2, []);
});

Deno.test("cargar: solo datos, contados distintos; prefijos antes del fetch; el centinela se borra primero y va al final", async () => {
  const { driver, cypher, parametros } = driverFalso();
  const { pedir, vistas } = fuente(1204);
  assertEquals(await cargar(driver, SPARQL, pedir), 1204);
  assertStringIncludes(vistas[0], "SELECT DISTINCT ?s ?p ?o");
  assertStringIncludes(vistas[0], "FILTER(?c NOT IN (rdfs:Class, rdf:Property, owl:Class");
  assertEquals(cypher[0], "MATCH (c:_Carga) DELETE c");
  assertEquals(cypher[1], "MATCH (n) DETACH DELETE n");
  const fetch = cypher.findIndex((q) => q.includes("n10s.rdf.import.fetch"));
  assertEquals(cypher.filter((q) => q.includes("import")).length, 1); // un solo import: nada inline, nada privado
  const prefijos = parametros.slice(0, fetch).flatMap((p) => p.prefijo ? [p.prefijo] : []);
  assertEquals(prefijos, ["j", "t", "k", "doap", "rdf", "rdfs", "skos", "dct", "prov"]);
  const url = new URL(String(parametros[fetch].url));
  assertStringIncludes(url.searchParams.get("query") ?? "", "CONSTRUCT { ?s ?p ?o } WHERE { ?s a ?c .");
  assertEquals(cypher.at(-1), "CREATE (:_Carga {completa: true, cuando: datetime(), triples: $triples})");
  assertEquals(parametros.at(-1), { triples: 1204 });
});

Deno.test("cargar: un import de la fuente que falla o trae de menos deja la vista sin centinela", async () => {
  for (const prod of [{ estado: "KO" }, { triples: 1000 }]) {
    const { driver, cypher } = driverFalso(prod);
    await assertRejects(() => cargar(driver, SPARQL, fuente(1204).pedir), Error, SPARQL);
    assertEquals(cypher.includes("MATCH (n) DETACH DELETE n"), true);
    assertEquals(cypher.some((q) => q.startsWith("CREATE (:_Carga")), false);
  }
});
