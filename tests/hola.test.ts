// Tests de ejemplos/hola.ts (deno task hola) con un fetch falso: nunca tocan la red. El fetch contesta según la
// consulta, y las de la instancia solo contestan si llevan el IRI que salió de la consulta anterior: si hola.ts
// escribiera una clase a mano, no habría instancia que mostrar.

// @ts-types="@types/n3"
import { Parser } from "n3";
import { assertEquals, assertRejects } from "@std/assert";
import { corto, hola } from "../ejemplos/hola.ts";

const resultados = (vars: string[], bindings: Record<string, { type: string; value: string }>[]) =>
  new Response(JSON.stringify({ head: { vars }, results: { bindings } }), {
    headers: { "Content-Type": "application/sparql-results+json" },
  });
const iri = (value: string) => ({ type: "uri", value });
const literal = (value: string) => ({ type: "literal", value });

// Nueve clases inventadas: el ejemplo muestra 8. La primera por cantidad es urn:ej#Cosa.
const CLASES = [
  ["urn:ej#Cosa", "9"],
  ["https://otro.dev/v/Bicho", "7"],
  ["urn:ej#A", "5"],
  ["urn:ej#B", "5"],
  ["urn:ej#C", "4"],
  ["urn:ej#D", "3"],
  ["urn:ej#E", "2"],
  ["urn:ej#F", "1"],
  ["urn:ej#G", "1"],
];
const INSTANCIA = "urn:ej:cosa-1";

function fetchFalso(consultas: string[] = []) {
  return (pedido: Request) => {
    const q = new URL(pedido.url).searchParams.get("query") ?? "";
    consultas.push(q);
    if (q.includes("COUNT(*)")) return Promise.resolve(resultados(["n"], [{ n: literal("42") }]));
    if (q.includes("GROUP BY ?clase")) {
      return Promise.resolve(resultados(["clase", "n"], CLASES.map(([c, n]) => ({ clase: iri(c), n: literal(n) }))));
    }
    if (q.includes("?s a <urn:ej#Cosa>")) return Promise.resolve(resultados(["s"], [{ s: iri(INSTANCIA) }]));
    if (q.includes(`<${INSTANCIA}> ?p ?o`)) {
      return Promise.resolve(resultados(["p", "o"], [
        { p: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), o: iri("urn:ej#Cosa") },
        { p: iri("urn:ej#nombre"), o: literal("una cosa\ncon salto") },
        { p: iri("urn:ej#nota"), o: literal("x".repeat(80)) },
      ]));
    }
    return Promise.resolve(resultados([], []));
  };
}

Deno.test("hola: cuenta los hechos, lista 8 de las clases y muestra una instancia de la primera", async () => {
  const consultas: string[] = [];
  const lineas = await hola({ url: "http://falso", fetch: fetchFalso(consultas) });
  assertEquals(lineas, [
    "The graph has 42 facts (triples).",
    "",
    "Classes, by number of instances (top 8 of 9):",
    "      9  Cosa   urn:ej#Cosa",
    "      7  Bicho  https://otro.dev/v/Bicho",
    "      5  A      urn:ej#A",
    "      5  B      urn:ej#B",
    "      4  C      urn:ej#C",
    "      3  D      urn:ej#D",
    "      2  E      urn:ej#E",
    "      1  F      urn:ej#F",
    "",
    "One Cosa, and its properties:",
    "  urn:ej:cosa-1",
    "    type    Cosa",
    '    nombre  "una cosa con salto"',
    `    nota    "${"x".repeat(59)}…"`,
  ]);
  assertEquals(consultas.length, 4);
});

Deno.test("hola: sin url va a producción, y cada consulta es un GET /sparql", async () => {
  const urls: string[] = [];
  const base = fetchFalso();
  await hola({
    fetch: (pedido: Request) => {
      urls.push(`${pedido.method} ${new URL(pedido.url).origin}${new URL(pedido.url).pathname}`);
      return base(pedido);
    },
  });
  assertEquals([...new Set(urls)], ["GET https://ontology.kiri231.com/sparql"]);
});

Deno.test("hola: un IRI que no se puede escribir en una consulta no se pega", async () => {
  const fetch = (pedido: Request) => {
    const q = new URL(pedido.url).searchParams.get("query") ?? "";
    if (q.includes("COUNT(*)")) return Promise.resolve(resultados(["n"], [{ n: literal("1") }]));
    return Promise.resolve(resultados(["clase", "n"], [{ clase: iri("urn:x> } DROP ALL { <urn:y"), n: literal("1") }]));
  };
  await assertRejects(() => hola({ url: "http://falso", fetch }), TypeError, "no se puede escribir");
});

Deno.test("hola: corto() deja lo que sigue al último # o /", () => {
  assertEquals(
    ["https://a.dev/x#Y", "http://a.dev/v/Z", "urn:solo"].map(corto),
    ["Y", "Z", "urn:solo"],
  );
});

// La regla del ejemplo: las clases salen del grafo, el código no nombra ninguna. Las del dominio son las de la copia
// del grafo que usan los tests del explorador.
Deno.test("hola: ejemplos/hola.ts no nombra ninguna clase del dominio", async () => {
  const ttl = await Deno.readTextFile(new URL("../explorador/pruebas/datos/grafo.ttl", import.meta.url));
  const TIPO = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const ESQUEMA = /^http:\/\/www\.w3\.org\//;
  const clases = new Set<string>();
  for (const q of new Parser().parse(ttl)) {
    if (q.predicate.value === TIPO && !ESQUEMA.test(q.object.value)) clases.add(corto(q.object.value));
    if (q.predicate.value === TIPO && q.object.value.endsWith("rdf-schema#Class")) clases.add(corto(q.subject.value));
  }
  assertEquals(clases.size > 3, true, `el grafo de prueba debería tener clases: ${[...clases]}`);
  const fuente = await Deno.readTextFile(new URL("../ejemplos/hola.ts", import.meta.url));
  const nombradas = [...clases].filter((c) => new RegExp(`\\b${c}\\b`).test(fuente));
  assertEquals(nombradas, []);
});
