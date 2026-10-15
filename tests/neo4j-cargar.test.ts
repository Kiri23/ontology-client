// Tests de cargar() (scripts/neo4j-cargar.ts) con un Driver y un fetch falsos: no tocan la red. Lo que prueban es el
// orden: nada se borra si la fuente no responde, y el centinela de carga completa va al final, solo si todo entró.

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import type { Driver } from "neo4j-driver";
import { cargar } from "../scripts/neo4j-cargar.ts";

const SPARQL = "https://fuente.invalid/sparql";
const ARCHIVOS = [{ nombre: "domain/jobs.ttl", texto: "@prefix j: <https://kiri23.dev/jobs#> ." }];

// Un Driver que anota cada Cypher y responde a los imports con `estado` y `triples` (el inline, 10; el fetch, `prod`).
function driverFalso(prod: { estado?: string; triples?: number } = {}) {
  const cypher: string[] = [];
  const driver = {
    executeQuery: (q: string) => {
      cypher.push(q);
      const fetch = q.includes("import.fetch");
      const triples = fetch ? prod.triples ?? 1173 : 10;
      const valores: Record<string, unknown> = {
        terminationStatus: fetch ? prod.estado ?? "OK" : "OK",
        triplesLoaded: triples,
        triplesParsed: triples,
        extraInfo: "",
      };
      return Promise.resolve({ records: q.includes("import") ? [{ get: (k: string) => valores[k] }] : [] });
    },
  } as unknown as Driver;
  return { driver, cypher };
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
  await assertRejects(() => cargar(driver, ARCHIVOS, SPARQL, caida as typeof fetch), TypeError, "connection refused");
  assertEquals(cypher, []);
  const { driver: d2, cypher: c2 } = driverFalso();
  const http500 = () => Promise.resolve(new Response("caído", { status: 500 }));
  await assertRejects(() => cargar(d2, ARCHIVOS, SPARQL, http500 as typeof fetch), Error, "HTTP 500");
  assertEquals(c2, []);
});

Deno.test("cargar: cuenta triples distintos, borra el centinela antes que nada y lo crea al final", async () => {
  const { driver, cypher } = driverFalso();
  const { pedir, vistas } = fuente(1173);
  assertEquals(await cargar(driver, ARCHIVOS, SPARQL, pedir), 1183);
  assertStringIncludes(vistas[0], "SELECT DISTINCT ?s ?p ?o");
  assertEquals(cypher[0], "MATCH (c:_Carga) DELETE c");
  assertEquals(cypher[1], "MATCH (n) DETACH DELETE n");
  assertEquals(cypher.at(-1), "CREATE (:_Carga {completa: true, cuando: datetime(), triples: $triples})");
  assertEquals(cypher.filter((q) => q.includes("_Carga")).length, 2);
});

Deno.test("cargar: un import de la fuente que falla o trae de menos deja la vista sin centinela", async () => {
  for (const prod of [{ estado: "KO" }, { triples: 1000 }]) {
    const { driver, cypher } = driverFalso(prod);
    await assertRejects(() => cargar(driver, ARCHIVOS, SPARQL, fuente(1173).pedir), Error, SPARQL);
    assertEquals(cypher.includes("MATCH (n) DETACH DELETE n"), true);
    assertEquals(cypher.some((q) => q.startsWith("CREATE (:_Carga")), false);
  }
});
