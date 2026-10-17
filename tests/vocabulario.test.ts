// Tests de `deno task vocabulario`: el validador rechaza cada regla rota nombrando el término, el render escribe
// los lados que el TTL no dice (Narrower, Related al revés) y la comparación de --check ve archivos editados y
// sobrantes. Que docs/vocabulary/ esté al día lo chequea CI con `deno task vocabulario --check`.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { leer } from "../scripts/vocabulario/leer.ts";
import { validar } from "../scripts/vocabulario/validar.ts";
import { renderizar } from "../scripts/vocabulario/renderizar.ts";
import { comparar } from "../scripts/vocabulario/archivos.ts";

const PREFIJOS = `@prefix v: <https://kiri23.dev/vocabulario#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
`;

// Un concepto válido con slug `slug`; `extra` suma triples (cada uno terminado en " ;").
function concepto(slug: string, extra = ""): string {
  return `v:${slug} a skos:Concept ; ${extra}
  skos:prefLabel "${slug.toUpperCase()}"@en ;
  skos:definition "Definition of ${slug}."@en .
`;
}

const errores = (ttl: string) => validar(leer(PREFIJOS + ttl));

Deno.test("validar: el vocabulario commiteado no rompe ninguna regla", async () => {
  const ttl = await Deno.readTextFile(new URL("../docs/vocabulary.ttl", import.meta.url));
  assertEquals(validar(leer(ttl)), []);
});

Deno.test("validar: un vocabulario mínimo con broader y related pasa", () => {
  assertEquals(errores(concepto("padre") + concepto("hijo", "skos:broader v:padre ; skos:related v:padre ;")), []);
});

Deno.test("validar: rechaza un concepto sin definition", () => {
  assertEquals(errores(`v:rdf a skos:Concept ; skos:prefLabel "RDF"@en .`), [
    "rdf: tiene 0 skos:definition en @en; tiene que tener exactamente uno",
  ]);
});

Deno.test("validar: rechaza un label sin @en", () => {
  const e = errores(`v:rdf a skos:Concept ; skos:prefLabel "RDF" ; skos:definition "A data model."@en .`);
  assertEquals(e, [
    'rdf: skos:prefLabel "RDF" no tiene @en',
    "rdf: tiene 0 skos:prefLabel en @en; tiene que tener exactamente uno",
  ]);
});

Deno.test("validar: rechaza dos prefLabel en @en", () => {
  assertEquals(errores(concepto("rdf", 'skos:prefLabel "Otro"@en ;')), [
    "rdf: tiene 2 skos:prefLabel en @en; tiene que tener exactamente uno",
  ]);
});

Deno.test("validar: rechaza broader y related a un término inexistente", () => {
  assertEquals(errores(concepto("turtle", "skos:broader v:sintaxis ; skos:related v:rdf ;")), [
    "turtle: skos:broader apunta a https://kiri23.dev/vocabulario#sintaxis, que no es un skos:Concept del vocabulario",
    "turtle: skos:related apunta a https://kiri23.dev/vocabulario#rdf, que no es un skos:Concept del vocabulario",
  ]);
});

Deno.test("validar: rechaza un ciclo en broader, también de un solo término", () => {
  const ttl = concepto("a", "skos:broader v:b ;") + concepto("b", "skos:broader v:c ;") +
    concepto("c", "skos:broader v:a ;") + concepto("d", "skos:broader v:d ;");
  assertEquals(errores(ttl), ["ciclo en skos:broader: a → b → c → a", "ciclo en skos:broader: d → d"]);
});

Deno.test("validar: rechaza un local name que no sirve de archivo y uno repetido", () => {
  const ttl = concepto("Mal_Nombre") + concepto("readme") +
    `<https://otro.dev/x#rdf> a skos:Concept ; skos:prefLabel "R"@en ; skos:definition "D."@en .\n` +
    concepto("rdf");
  const e = errores(ttl);
  assertEquals(e.length, 3);
  assertStringIncludes(e[0], '"Mal_Nombre" tiene que ser minúsculas');
  assertStringIncludes(e[1], '"readme" tiene que ser minúsculas');
  assertEquals(e[2], "rdf: https://kiri23.dev/vocabulario#rdf y https://otro.dev/x#rdf tienen el mismo local name");
});

Deno.test("validar: rechaza un seeAlso que no es URL http(s)", () => {
  assertEquals(errores(concepto("rdf", 'rdfs:seeAlso "la spec" ;')), [
    'rdf: rdfs:seeAlso "la spec" no es una URL http(s)',
  ]);
});

const TERMINOS = [
  concepto("rdf"),
  concepto("turtle", "skos:related v:rdf ;"),
  concepto("grafo", "skos:related v:rdf ;"),
  concepto("grafo-rdf", "skos:broader v:grafo ;"),
];
const paginas = () => renderizar(leer(PREFIJOS + TERMINOS.join("")));

Deno.test("renderizar: Narrower en la página del padre sin que el TTL lo diga", () => {
  const grafo = paginas().get("grafo.md")!;
  assertStringIncludes(grafo, "**Narrower**\n\n- [GRAFO-RDF](grafo-rdf.md)\n");
  assertStringIncludes(paginas().get("grafo-rdf.md")!, "**Broader**\n\n- [GRAFO](grafo.md)\n");
  assert(!paginas().get("rdf.md")!.includes("Narrower"), "rdf no tiene hijos: no lleva Narrower");
});

Deno.test("renderizar: Related aparece en las dos páginas aunque el triple esté en una", () => {
  assertStringIncludes(paginas().get("turtle.md")!, "**Related**\n\n- [RDF](rdf.md)\n");
  assertStringIncludes(paginas().get("rdf.md")!, "**Related**\n\n- [GRAFO](grafo.md)\n- [TURTLE](turtle.md)\n");
});

Deno.test("renderizar: una página entera, con cabecera, definición y See also", () => {
  const ttl = PREFIJOS + concepto("rdf", "rdfs:seeAlso <https://www.w3.org/TR/rdf11-concepts/> ;");
  assertEquals(
    renderizar(leer(ttl)).get("rdf.md"),
    "<!-- Generated from docs/vocabulary.ttl by `deno task vocabulario`. Do not edit by hand: edit the TTL and run " +
      "the task. -->\n\n# RDF\n\nDefinition of rdf.\n\n**See also**\n\n- <https://www.w3.org/TR/rdf11-concepts/>\n",
  );
});

Deno.test("renderizar: el índice va ordenado por label y no depende del orden del TTL", () => {
  assertEquals(renderizar(leer(PREFIJOS + TERMINOS.toReversed().join(""))), paginas());
  const indice = paginas().get("README.md")!;
  assert(indice.startsWith("<!-- Generated from docs/vocabulary.ttl"));
  const orden = [...indice.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
  assertEquals(orden, ["GRAFO", "GRAFO-RDF", "RDF", "TURTLE"]);
});

Deno.test("comparar: igual no da diferencias; detecta un .md editado a mano, uno sobrante y uno que falta", () => {
  const esperado = paginas();
  assertEquals(comparar(new Map(esperado), esperado), []);
  const actual = new Map(esperado);
  actual.set("rdf.md", esperado.get("rdf.md") + "\nUna línea a mano.\n");
  actual.set("viejo.md", "# Viejo\n");
  actual.delete("turtle.md");
  assertEquals(comparar(actual, esperado), [
    "rdf.md: no coincide con lo que sale de docs/vocabulary.ttl",
    "turtle.md: falta",
    "viejo.md: sobra (no sale de docs/vocabulary.ttl)",
  ]);
});
