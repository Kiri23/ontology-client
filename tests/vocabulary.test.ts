// Tests de la entrada `./vocabulary` del paquete (vocabulary.ts y vocabulary/): leer y recorrer un vocabulario SKOS,
// filtrar por un predicado propio, cada regla de `check().problems()` por separado, y crear, editar y volver a leer.
// Al final, que los scripts de este repo usan esta misma entrada y no una copia.
//
// El vocabulario de prueba trae lo que la librería no conoce de antemano: un predicado propio (`doc:symbol`) y un
// tipo propio (`doc:Page`), como los que un repo le suma a su TTL.

import { assert, assertEquals, assertThrows } from "@std/assert";
// @ts-types="@types/n3"
import { DataFactory } from "n3";
import { localName, type Problem, type Rule, SKOS, Term, Vocabulary } from "@kiri23/ontology-client/vocabulary";

const NS = "https://example.com/vocabulary#";
const DOC = "https://example.com/doc#";
const PREFIJOS = `@prefix v: <${NS}> .
@prefix doc: <${DOC}> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dct: <http://purl.org/dc/terms/> .
`;

const TTL = `${PREFIJOS}
v:vocabulary a skos:ConceptScheme ; skos:prefLabel "Demo"@en ; skos:definition "The terms of the demo."@en .

v:harness a skos:Concept ; skos:inScheme v:vocabulary ;
  skos:prefLabel "Harness"@en , "Arnés"@es ; skos:definition "A provider that runs an agent."@en ;
  skos:altLabel "Runner"@en , "Corredor"@es ;
  skos:broader v:provider ; skos:related v:run ;
  doc:symbol "@scope/pkg#Bench.harness" .

v:provider a skos:Concept ; skos:inScheme v:vocabulary ;
  skos:prefLabel "Provider"@en , "Proveedor"@es ;
  skos:definition "Who serves the model."@en , "Quien sirve el modelo."@es ;
  skos:example "An HTTP endpoint."@en , "Un endpoint HTTP."@es ;
  rdfs:seeAlso <https://example.com/providers> ;
  skos:narrower v:endpoint ;
  doc:symbol "@scope/pkg#Bench.provider" .

v:endpoint a skos:Concept ; skos:inScheme v:vocabulary ;
  skos:prefLabel "Endpoint"@en ; skos:definition "A provider behind a URL."@en .

v:cli-harness a skos:Concept ; skos:inScheme v:vocabulary ;
  skos:prefLabel "CLI harness"@en ; skos:definition "A harness you run from a terminal."@en ;
  skos:broader v:harness .

v:run a skos:Concept ; skos:inScheme v:vocabulary ;
  skos:prefLabel "  Run "@en ; skos:definition "One execution."@en .

doc:getting-started a doc:Page ; doc:path "tutorial/getting-started.md" ; dct:references v:provider , v:run .
doc:reference a doc:Page ; doc:path "reference.md" ; dct:references v:provider .
`;

const demo = () => Vocabulary.parse(TTL);

// Un término válido en @en; `extra` suma triples (cada uno terminado en " ;").
function termino(id: string, extra = ""): string {
  return `v:${id} a skos:Concept ; ${extra} skos:prefLabel "${id}"@en ; skos:definition "Definition of ${id}."@en .\n`;
}

// Las reglas rotas de un TTL (sin prefijos), con las reglas de siempre y las que `pedir` sume.
function reglas(ttl: string, pedir: (v: Vocabulary) => ReturnType<Vocabulary["check"]> = (v) => v.check()): Rule[] {
  return pedir(Vocabulary.parse(PREFIJOS + ttl)).problems().map((p) => p.rule);
}

function problemas(ttl: string, pedir: (v: Vocabulary) => ReturnType<Vocabulary["check"]>): Problem[] {
  return pedir(Vocabulary.parse(PREFIJOS + ttl)).problems();
}

// ── Leer y recorrer ──────────────────────────────────────────────────────────────────────────────────────────────

Deno.test("terms: los skos:Concept en el orden del archivo; el esquema y las páginas no son términos", () => {
  assertEquals(demo().terms().ids(), ["harness", "provider", "endpoint", "cli-harness", "run"]);
  assertEquals(demo().terms().size, 5);
  assertEquals(demo().terms().iris()[0], `${NS}harness`);
});

Deno.test("terms: un nodo en blanco y algo con label pero sin tipo no son términos", () => {
  const v = Vocabulary.parse(
    PREFIJOS + termino("a") + `[] a skos:Concept ; skos:prefLabel "Anon"@en .\nv:b skos:prefLabel "B"@en .\n`,
  );
  assertEquals(v.terms().ids(), ["a"]);
});

Deno.test("terms: algo que es a la vez skos:Concept y skos:ConceptScheme es el esquema, no un término", () => {
  const v = Vocabulary.parse(PREFIJOS + termino("a") + `v:ambos a skos:Concept , skos:ConceptScheme .\n`);
  assertEquals(v.terms().ids(), ["a"]);
  assertEquals(v.schemes().map((e) => e.id), ["ambos"]);
  assertEquals(v.check().problems(), []);
});

Deno.test("term: por local name o por IRI, con iri e id", () => {
  const porId = demo().term("provider");
  assert(porId instanceof Term);
  assertEquals([porId.id, porId.iri, porId.blank], ["provider", `${NS}provider`, false]);
  assertEquals(demo().term(`${NS}provider`).id, "provider");
  assertEquals(demo().term("v:provider").id, "provider");
});

Deno.test("term: uno que no existe lanza un error que dice cuáles hay; has() pregunta sin lanzar", () => {
  assertThrows(
    () => demo().term("nope"),
    Error,
    'No term "nope" in this vocabulary. It has 5: harness, provider, endpoint, cli-harness, run',
  );
  assertEquals([demo().has("provider"), demo().has("nope"), demo().has(`${NS}run`)], [true, false, true]);
  // El esquema existe en el archivo, pero no es un término.
  assertEquals(demo().has("vocabulary"), false);
});

Deno.test("term: un local name que está en dos namespaces pide el IRI", () => {
  const v = Vocabulary.parse(PREFIJOS + termino("a") + `<https://otro.dev/x#a> a skos:Concept .\n`);
  assertThrows(() => v.term("a"), Error, '"a" names 2 terms');
  assertEquals(v.term("https://otro.dev/x#a").iri, "https://otro.dev/x#a");
  assertEquals(v.namespace, undefined);
});

Deno.test("label: devuelve lo que está escrito, sin recortar ni traducir; con idioma elige ese", () => {
  assertEquals(demo().term("provider").label(), "Provider");
  assertEquals(demo().term("provider").label("es"), "Proveedor");
  assertEquals(demo().term("provider").label("ES"), "Proveedor");
  assertEquals(demo().term("run").label(), "  Run ");
  assertEquals(demo().term("endpoint").label("es"), undefined, "no inventa uno en otro idioma");
});

Deno.test("definition, altLabels, examples y seeAlso: lo escrito, filtrado por idioma si se pide", () => {
  const provider = demo().term("provider");
  assertEquals(provider.definition(), "Who serves the model.");
  assertEquals(provider.definition("es"), "Quien sirve el modelo.");
  assertEquals(provider.examples(), ["An HTTP endpoint.", "Un endpoint HTTP."]);
  assertEquals(provider.examples("es"), ["Un endpoint HTTP."]);
  assertEquals(provider.seeAlso(), ["https://example.com/providers"]);
  assertEquals(demo().term("harness").altLabels(), ["Runner", "Corredor"]);
  assertEquals(demo().term("harness").altLabels("es"), ["Corredor"]);
  assertEquals(demo().term("endpoint").altLabels(), []);
});

Deno.test("literals: cada texto con su idioma; lo que no es texto queda afuera", () => {
  assertEquals(demo().term("provider").literals("skos:prefLabel"), [
    { value: "Provider", language: "en" },
    { value: "Proveedor", language: "es" },
  ]);
  assertEquals(demo().term("provider").literals("doc:symbol"), [{ value: "@scope/pkg#Bench.provider", language: "" }]);
  assertEquals(demo().term("harness").literals("skos:broader"), []);
});

Deno.test("narrower: sale de skos:broader de los hijos y de skos:narrower del padre", () => {
  // harness dice `broader provider`; provider dice `narrower endpoint`.
  assertEquals(demo().term("provider").narrower().ids(), ["harness", "endpoint"]);
  assertEquals(demo().term("endpoint").narrower().ids(), []);
});

Deno.test("broader: el skos:broader escrito y el inverso de skos:narrower", () => {
  assertEquals(demo().term("harness").broader().ids(), ["provider"]);
  assertEquals(demo().term("endpoint").broader().ids(), ["provider"]);
  assertEquals(demo().term("provider").broader().ids(), []);
});

Deno.test("related: se lee desde los dos lados aunque esté escrito en uno", () => {
  assertEquals(demo().term("harness").related().ids(), ["run"]);
  assertEquals(demo().term("run").related().ids(), ["harness"]);
});

Deno.test("ancestors y descendants: todos los pasos, y un ciclo no los cuelga", () => {
  assertEquals(demo().term("cli-harness").ancestors().ids(), ["harness", "provider"]);
  assertEquals(demo().term("provider").descendants().ids(), ["harness", "endpoint", "cli-harness"]);
  const ciclo = Vocabulary.parse(PREFIJOS + termino("a", "skos:broader v:b ;") + termino("b", "skos:broader v:a ;"));
  assertEquals(ciclo.term("a").ancestors().ids(), ["a", "b"]);
  assertEquals(ciclo.term("a").descendants().ids(), ["a", "b"]);
});

Deno.test("relaciones: un broader a otro vocabulario no es un término de este, pero sigue en values()", () => {
  const v = Vocabulary.parse(PREFIJOS + termino("a", "skos:broader <https://otro.dev/x#padre> ;"));
  assertEquals(v.term("a").broader().ids(), []);
  assertEquals(v.term("a").values("skos:broader"), ["https://otro.dev/x#padre"]);
});

Deno.test("values: un predicado propio se pide por el prefijo del TTL o por el IRI entero", () => {
  const provider = demo().term("provider");
  assertEquals(provider.values("doc:symbol"), ["@scope/pkg#Bench.provider"]);
  assertEquals(provider.values(`${DOC}symbol`), ["@scope/pkg#Bench.provider"]);
  assertEquals(provider.values("doc:nothing"), []);
  assertEquals(demo().term("harness").values("skos:broader"), [`${NS}provider`]);
});

Deno.test("values: un prefijo que nadie declaró lanza; skos:, rdf:, rdfs: y dct: andan sin declararlos", () => {
  assertThrows(() => demo().term("provider").values("dco:symbol"), Error, 'Unknown prefix "dco:" in "dco:symbol"');
  const sinPrefijos = Vocabulary.parse(
    `<${NS}a> a <${SKOS}Concept> ; <${SKOS}prefLabel> "A"@en ; <http://purl.org/dc/terms/source> "x" .`,
  );
  assertEquals(sinPrefijos.term("a").values("skos:prefLabel"), ["A"]);
  assertEquals(sinPrefijos.term("a").values("dct:source"), ["x"]);
  assertEquals(sinPrefijos.term("a").types(), [`${SKOS}Concept`]);
});

Deno.test("where: missing, exists e is filtran por un predicado y se siguen encadenando", () => {
  const terminos = demo().terms();
  assertEquals(terminos.where("doc:symbol").missing().ids(), ["endpoint", "cli-harness", "run"]);
  assertEquals(terminos.where("doc:symbol").exists().ids(), ["harness", "provider"]);
  assertEquals(terminos.where("doc:symbol").is("@scope/pkg#Bench.provider").ids(), ["provider"]);
  assertEquals(terminos.where(`${DOC}symbol`).is("@scope/pkg#Bench.provider").ids(), ["provider"]);
  assertEquals(terminos.where("skos:broader").is(`${NS}provider`).ids(), ["harness"]);
  assertEquals(terminos.where("skos:broader").missing().where("doc:symbol").exists().ids(), ["provider"]);
  assertThrows(() => terminos.where("dco:symbol"), Error, "Unknown prefix");
});

Deno.test("Terms: se recorre con for…of, map, filter y toArray", () => {
  const terminos = demo().terms();
  assertEquals([...terminos].map((t) => t.id), terminos.ids());
  assertEquals(terminos.map((t) => t.label("en")), ["Harness", "Provider", "Endpoint", "CLI harness", "  Run "]);
  assertEquals(terminos.filter((t) => t.id.includes("harness")).ids(), ["harness", "cli-harness"]);
  assertEquals(terminos.toArray().length, 5);
});

Deno.test("referencedBy: los recursos que apuntan al término con ese predicado", () => {
  const paginas = demo().term("provider").referencedBy("dct:references");
  assertEquals(paginas.map((p) => p.id), ["getting-started", "reference"]);
  assertEquals(paginas.map((p) => p.values("doc:path")), [["tutorial/getting-started.md"], ["reference.md"]]);
  assertEquals(demo().term("run").referencedBy("dct:references").map((p) => p.id), ["getting-started"]);
  assertEquals(demo().term("endpoint").referencedBy("dct:references"), []);
  assertEquals(demo().term("provider").referencedBy("skos:broader").map((t) => t.id), ["harness"]);
});

Deno.test("instancesOf: lo que no es término, por su tipo", () => {
  assertEquals(demo().instancesOf("doc:Page").map((p) => p.values("doc:path")), [
    ["tutorial/getting-started.md"],
    ["reference.md"],
  ]);
  assertEquals(demo().instancesOf(`${DOC}Page`).length, 2);
  assertEquals(demo().instancesOf("doc:Nothing"), []);
});

Deno.test("scheme: el skos:ConceptScheme como recurso, con su label y su definición", () => {
  const esquema = demo().scheme()!;
  assertEquals([esquema.id, esquema.label(), esquema.definition()], ["vocabulary", "Demo", "The terms of the demo."]);
  assertEquals(demo().schemes().length, 1);
  assertEquals(Vocabulary.parse(PREFIJOS + termino("a")).scheme(), undefined);
});

Deno.test("store, prefixes, quads y namespace: el grafo de n3 queda a mano, sin envolver", () => {
  const v = demo();
  assertEquals(v.prefixes.doc, DOC);
  assertEquals(v.prefixes.v, NS);
  assertEquals(v.namespace, NS);
  assertEquals(v.term("endpoint").quads().length, 4);
  assertEquals(v.store.size, v.store.getQuads(null, null, null, null).length);
  // Lo que se agrega al Store se ve desde los términos: leen el grafo cada vez.
  const { quad, namedNode } = DataFactory;
  v.store.addQuad(
    quad(namedNode("README.md"), namedNode("http://purl.org/dc/terms/references"), v.term("endpoint").node),
  );
  assertEquals(v.term("endpoint").referencedBy("dct:references").map((r) => r.iri), ["README.md"]);
});

Deno.test("parse: un texto que no es Turtle lanza el error de n3", () => {
  assertThrows(() => Vocabulary.parse("esto no es turtle"), Error);
});

// ── Validar: una regla por test ──────────────────────────────────────────────────────────────────────────────────

const DEMO_COMPLETO = (v: Vocabulary) => v.check().language("en").namespace(NS).oneScheme().seeAlsoUrls();

Deno.test("check: un vocabulario bien formado no tiene problemas, ni con todas las reglas pedidas", () => {
  // En @en harness y provider tienen además un label en @es: la regla del idioma no los deja pasar.
  const soloIngles = TTL.replace(', "Arnés"@es', "").replace(', "Proveedor"@es', "")
    .replace(', "Quien sirve el modelo."@es', "");
  assertEquals(DEMO_COMPLETO(Vocabulary.parse(soloIngles)).problems(), []);
  assert(DEMO_COMPLETO(Vocabulary.parse(soloIngles)).passes());
  assertEquals(demo().check().problems(), []);
  assert(!DEMO_COMPLETO(demo()).passes());
});

Deno.test("check: cada problema trae term, rule y message en inglés", () => {
  assertEquals(problemas(termino("a", "skos:related v:a ;"), (v) => v.check()), [
    { term: `${NS}a`, rule: "related-self", message: "a: skos:related points to itself" },
  ]);
});

Deno.test("regla no-concepts: sin ningún skos:Concept, y no sigue mirando", () => {
  assertEquals(problemas(`v:a skos:prefLabel "A"@en .`, (v) => v.check()), [
    { term: "", rule: "no-concepts", message: "the vocabulary has no skos:Concept" },
  ]);
  assertEquals(reglas(""), ["no-concepts"]);
});

Deno.test("regla not-a-concept: tiene label o definition pero no es `a skos:Concept`", () => {
  const p = problemas(termino("a") + `v:b skos:definition "B."@en .`, (v) => v.check());
  assertEquals(p.map((x) => [x.rule, localName(x.term)]), [["not-a-concept", "b"]]);
  assertEquals(p[0].message, "b: has a label or a definition but is not `a skos:Concept`");
});

Deno.test("regla blank-node: un término sin IRI", () => {
  const p = problemas(termino("a") + `[] a skos:Concept ; skos:prefLabel "Anon"@en .`, (v) => v.check());
  assertEquals(p.map((x) => [x.rule, x.value, x.message]), [
    ["blank-node", "Anon", 'blank node "Anon": a term needs an IRI'],
  ]);
});

Deno.test("regla missing-target: broader, narrower y related a algo que no es un término", () => {
  const ttl = termino("a", "skos:broader v:x ; skos:narrower v:y ; skos:related v:z ;") +
    `v:vocabulary a skos:ConceptScheme .\n` + termino("b", "skos:broader v:vocabulary ;");
  assertEquals(problemas(ttl, (v) => v.check()).map((x) => [x.rule, localName(x.term), x.property, x.value]), [
    ["missing-target", "a", "skos:broader", `${NS}x`],
    ["missing-target", "a", "skos:narrower", `${NS}y`],
    ["missing-target", "a", "skos:related", `${NS}z`],
    ["missing-target", "b", "skos:broader", `${NS}vocabulary`],
  ]);
});

Deno.test("regla related-self: related apunta al mismo término", () => {
  assertEquals(reglas(termino("a", "skos:related v:a ;")), ["related-self"]);
});

Deno.test("regla related-broader-overlap: related une dos términos que la jerarquía ya une, directo o transitivo", () => {
  const ttl = termino("abuelo", "skos:related v:hijo ;") + termino("padre", "skos:broader v:abuelo ;") +
    termino("hijo", "skos:broader v:padre ; skos:related v:padre ;") + termino("tio", "skos:related v:padre ;");
  assertEquals(problemas(ttl, (v) => v.check()).map((x) => [x.rule, localName(x.term), localName(x.value!)]), [
    ["related-broader-overlap", "abuelo", "hijo"],
    ["related-broader-overlap", "hijo", "padre"],
  ]);
  // También cuando la jerarquía está escrita al revés, con skos:narrower.
  assertEquals(reglas(termino("a", "skos:narrower v:b ; skos:related v:b ;") + termino("b")), [
    "related-broader-overlap",
  ]);
});

Deno.test("regla broader-cycle: cada ciclo una vez, con su camino; también de un solo término", () => {
  const ttl = termino("a", "skos:broader v:b ;") + termino("b", "skos:broader v:c ;") +
    termino("c", "skos:broader v:a ;") + termino("d", "skos:broader v:d ;");
  const p = problemas(ttl, (v) => v.check());
  assertEquals(p.map((x) => [x.rule, x.values!.map(localName).join(" ")]), [
    ["broader-cycle", "a b c a"],
    ["broader-cycle", "d d"],
  ]);
  assertEquals(p[0].message, "skos:broader has a cycle: a → b → c → a");
});

Deno.test("regla language: un label o una definición en otro idioma o sin idioma (solo con .language())", () => {
  const ttl = `v:a a skos:Concept ; skos:prefLabel "A"@en , "Ah"@es ; skos:definition "D."@en , "Sin idioma" .`;
  assertEquals(reglas(ttl), [], "sin .language() no se mira el idioma");
  const p = problemas(ttl, (v) => v.check().language("en"));
  assertEquals(p.map((x) => [x.rule, x.property, x.value, x.found, x.expected]), [
    ["language", "skos:prefLabel", "Ah", "es", "en"],
    ["language", "skos:definition", "Sin idioma", "", "en"],
  ]);
  assertEquals(p.map((x) => x.message), [
    'a: skos:prefLabel "Ah" is tagged @es; it must be @en',
    'a: skos:definition "Sin idioma" has no language tag; it must be @en',
  ]);
});

Deno.test("regla cardinality: ni cero ni dos labels o definiciones en el idioma", () => {
  const ttl = `v:a a skos:Concept ; skos:prefLabel "A"@en , "Otra"@en .`;
  assertEquals(reglas(ttl), []);
  assertEquals(
    problemas(ttl, (v) => v.check().language("en")).map((x) => [x.rule, x.property, x.count, x.message]),
    [
      ["cardinality", "skos:prefLabel", 2, "a: has 2 skos:prefLabel in @en; it must have exactly one"],
      ["cardinality", "skos:definition", 0, "a: has 0 skos:definition in @en; it must have exactly one"],
    ],
  );
});

Deno.test("regla empty: un label o una definición en blanco", () => {
  const ttl = `v:a a skos:Concept ; skos:prefLabel ""@en ; skos:definition "  "@en .`;
  assertEquals(reglas(ttl), []);
  assertEquals(problemas(ttl, (v) => v.check().language("en")).map((x) => [x.rule, x.property]), [
    ["empty", "skos:prefLabel"],
    ["empty", "skos:definition"],
  ]);
});

Deno.test("regla namespace: un término fuera del namespace (solo con .namespace())", () => {
  const ttl = termino("a") + `<https://otro.dev/x#b> a skos:Concept .\n`;
  assertEquals(reglas(ttl), []);
  assertEquals(problemas(ttl, (v) => v.check().namespace(NS)).map((x) => [x.rule, x.term, x.expected]), [
    ["namespace", "https://otro.dev/x#b", NS],
  ]);
});

Deno.test("regla local-name: minúsculas, dígitos y guiones, y no readme", () => {
  const ttl = termino("Mal_Nombre") + termino("readme") + termino("bien-2") + termino("doble--guion");
  assertEquals(reglas(ttl), []);
  assertEquals(problemas(ttl, (v) => v.check().namespace(NS)).map((x) => [x.rule, x.value]), [
    ["local-name", "Mal_Nombre"],
    ["local-name", "readme"],
    ["local-name", "doble--guion"],
  ]);
});

Deno.test("regla scheme-count: ni cero ni dos skos:ConceptScheme (solo con .oneScheme())", () => {
  assertEquals(reglas(termino("a")), []);
  assertEquals(problemas(termino("a"), (v) => v.check().oneScheme()).map((x) => [x.rule, x.count, x.values]), [
    ["scheme-count", 0, []],
  ]);
  const dos = `v:uno a skos:ConceptScheme . v:dos a skos:ConceptScheme .\n` + termino("a", "skos:inScheme v:uno ;");
  assertEquals(problemas(dos, (v) => v.check().oneScheme()).map((x) => [x.rule, x.count, x.values]), [
    ["scheme-count", 2, [`${NS}uno`, `${NS}dos`]],
  ]);
  // Sin términos se dicen los dos problemas del archivo entero.
  assertEquals(reglas("", (v) => v.check().oneScheme()), ["no-concepts", "scheme-count"]);
});

Deno.test("regla in-scheme: cada término en el esquema del archivo, y solo en ese", () => {
  const ttl = `v:vocabulary a skos:ConceptScheme .\n` + termino("bien", "skos:inScheme v:vocabulary ;") +
    termino("sin") + termino("otro", "skos:inScheme v:otro ;") +
    termino("dos", "skos:inScheme v:vocabulary , v:otro ;");
  assertEquals(reglas(ttl), []);
  assertEquals(
    problemas(ttl, (v) => v.check().oneScheme()).map((x) => [x.rule, localName(x.term), x.count, x.expected]),
    [
      ["in-scheme", "sin", 0, `${NS}vocabulary`],
      ["in-scheme", "otro", 1, `${NS}vocabulary`],
      ["in-scheme", "dos", 2, `${NS}vocabulary`],
    ],
  );
});

Deno.test("regla see-also-not-iri: un seeAlso que es texto (solo con .seeAlsoUrls())", () => {
  const ttl = termino("a", 'rdfs:seeAlso "la spec" ;');
  assertEquals(reglas(ttl), []);
  assertEquals(problemas(ttl, (v) => v.check().seeAlsoUrls()).map((x) => [x.rule, x.value, x.found]), [
    ["see-also-not-iri", "la spec", "Literal"],
  ]);
});

Deno.test("regla see-also-not-http: un seeAlso que no es una dirección http(s)", () => {
  const ttl = termino("a", "rdfs:seeAlso <mailto:a@b.c> , <https://example.com/a> ;");
  assertEquals(reglas(ttl), []);
  assertEquals(problemas(ttl, (v) => v.check().seeAlsoUrls()).map((x) => [x.rule, x.value]), [
    ["see-also-not-http", "mailto:a@b.c"],
  ]);
});

Deno.test("context: broader y related pueden apuntar a términos de otro vocabulario, que no se revisa", () => {
  const otro = Vocabulary.parse(
    `@prefix o: <https://otro.dev/x#> . @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
o:padre a skos:Concept . o:suelto skos:prefLabel "Sin tipo" .`,
  );
  const ttl = termino("a", "skos:broader <https://otro.dev/x#padre> ; skos:related <https://otro.dev/x#suelto> ;");
  assertEquals(reglas(ttl), ["missing-target", "missing-target"]);
  // o:padre es un término de `otro`; o:suelto no lo es, y que le falte el tipo es problema de `otro`, no de este.
  assertEquals(problemas(ttl, (v) => v.check().context(otro)).map((x) => [x.rule, x.value]), [
    ["missing-target", "https://otro.dev/x#suelto"],
  ]);
  assertEquals(reglas(termino("a", "skos:broader <https://otro.dev/x#padre> ;"), (v) => v.check().context(otro)), []);
});

Deno.test("problems: primero los del archivo, después cada término en el orden del archivo, al final los ciclos", () => {
  const ttl = termino("z", "skos:broader v:z ; skos:related v:nada ;") + `v:m skos:prefLabel "M"@en .\n` +
    termino("a", 'rdfs:seeAlso "x" ;');
  assertEquals(
    problemas(ttl, (v) => v.check().oneScheme().seeAlsoUrls()).map((x) => [x.rule, localName(x.term)]),
    [["scheme-count", ""], ["missing-target", "z"], ["not-a-concept", "m"], ["see-also-not-iri", "a"], [
      "broader-cycle",
      "z",
    ]],
  );
});

// ── Crear y editar ───────────────────────────────────────────────────────────────────────────────────────────────

// El vocabulario del ejemplo de la documentación, creado desde cero.
function creado(): Vocabulary {
  const v = Vocabulary.create(NS).language("es").prefix("doc", DOC);
  v.scheme("vocabulario").label("Demo").definition("Los términos de la demo.");
  v.add("provider").label("Provider").definition("Quien sirve el modelo.");
  v.add("harness").label("Harness").definition("Un provider que corre un agente.").broader("provider")
    .value("doc:symbol", "@scope/pkg#Bench.harness").example("Claude Code.").seeAlso("https://example.com/harness");
  v.edit("harness").altLabel("Arnés").related("provider");
  return v;
}

const triples = (v: Vocabulary) =>
  v.store.getQuads(null, null, null, null).map((q) =>
    `${q.subject.value} ${q.predicate.value} ${q.object.value} @${"language" in q.object ? q.object.language : "iri"}`
  ).sort();

Deno.test("create → toTurtle → parse: vuelve el mismo vocabulario", () => {
  const original = creado();
  const leido = Vocabulary.parse(original.toTurtle());
  assertEquals(triples(leido), triples(original));
  assertEquals(leido.terms().ids(), ["provider", "harness"]);
  assertEquals(leido.scheme()!.label("es"), "Demo");
  assertEquals(leido.term("harness").label("es"), "Harness");
  assertEquals(leido.term("harness").altLabels("es"), ["Arnés"]);
  assertEquals(leido.term("harness").examples("es"), ["Claude Code."]);
  assertEquals(leido.term("harness").seeAlso(), ["https://example.com/harness"]);
  assertEquals(leido.term("harness").values("doc:symbol"), ["@scope/pkg#Bench.harness"]);
  assertEquals(leido.term("harness").literals("doc:symbol"), [{ value: "@scope/pkg#Bench.harness", language: "" }]);
  assertEquals(leido.term("provider").narrower().ids(), ["harness"]);
  assertEquals(leido.namespace, NS);
  assertEquals(leido.prefixes.doc, DOC);
});

Deno.test("create: lo creado pasa las reglas, con el esquema puesto solo en cada término", () => {
  const sinRelated = creado();
  sinRelated.edit("harness").unset("skos:related");
  assertEquals(sinRelated.check().language("es").namespace(NS).oneScheme().seeAlsoUrls().problems(), []);
  assertEquals(sinRelated.term("harness").values("skos:inScheme"), [`${NS}vocabulario`]);
  // related entre un término y su padre lo rechaza la regla de siempre.
  assertEquals(creado().check().problems().map((p) => p.rule), ["related-broader-overlap"]);
});

Deno.test("toTurtle: un bloque por recurso en el orden en que se escribieron, con sus prefijos", () => {
  const turtle = creado().toTurtle();
  assert(turtle.includes(`@prefix : <${NS}>.`), turtle);
  assert(turtle.includes(`@prefix doc: <${DOC}>.`), turtle);
  assert(turtle.includes(":vocabulario a skos:ConceptScheme;"), turtle);
  assert(turtle.includes(":harness a skos:Concept;"), turtle);
  assert(turtle.includes('doc:symbol "@scope/pkg#Bench.harness"'), turtle);
  const orden = [":vocabulario a", ":provider a", ":harness a"].map((bloque) => turtle.indexOf(bloque));
  assertEquals(orden, [...orden].sort((a, b) => a - b));
});

Deno.test("toTurtle: no preserva los comentarios de un archivo escrito a mano", () => {
  const aMano = PREFIJOS + "# Un comentario que explica el término.\n" + termino("a");
  assert(!Vocabulary.parse(aMano).toTurtle().includes("Un comentario"));
});

Deno.test("language: sin idioma el texto va sin etiqueta; el segundo argumento elige otro", () => {
  const v = Vocabulary.create(NS);
  v.add("a").label("A").label("Ah", "es").definition("D.", "EN");
  assertEquals(v.term("a").literals("skos:prefLabel"), [{ value: "A", language: "" }, { value: "Ah", language: "es" }]);
  assertEquals(v.term("a").literals("skos:definition"), [{ value: "D.", language: "en" }]);
});

Deno.test("label y definition: reemplazan el del mismo idioma y dejan los otros", () => {
  const v = creado();
  v.edit("provider").label("Proveedor").label("Provider", "en").definition("Otra.");
  assertEquals(v.term("provider").literals("skos:prefLabel"), [
    { value: "Proveedor", language: "es" },
    { value: "Provider", language: "en" },
  ]);
  assertEquals(v.term("provider").definition(), "Otra.");
  assertEquals(v.term("provider").literals("skos:definition").length, 1);
});

Deno.test("add: un nombre que ya está lanza; edit de uno que no existe también", () => {
  assertThrows(() => creado().add("provider"), Error, '"provider" is already in this vocabulary');
  assertThrows(() => creado().edit("nope"), Error, 'No term "nope"');
  assertThrows(() => creado().remove("nope"), Error, 'No term "nope"');
});

Deno.test("remove: saca el término y todo lo que le apuntaba", () => {
  const v = creado().remove("provider");
  assertEquals(v.terms().ids(), ["harness"]);
  assertEquals(v.term("harness").values("skos:broader"), []);
  assertEquals(v.term("harness").values("skos:related"), []);
  assertEquals(v.check().problems(), []);
});

Deno.test("value, link y unset: escribir y sacar un predicado propio", () => {
  const v = creado();
  v.edit("provider").value("doc:symbol", "a").value("doc:symbol", "b").link("doc:page", "doc:intro").link(
    "doc:replaces",
    "harness",
  );
  assertEquals(v.term("provider").values("doc:symbol"), ["a", "b"]);
  assertEquals(v.term("provider").values("doc:page"), [`${DOC}intro`]);
  assertEquals(v.term("provider").values("doc:replaces"), [`${NS}harness`]);
  v.edit("provider").unset("doc:symbol", "a").unset("doc:replaces", "harness");
  assertEquals(v.term("provider").values("doc:symbol"), ["b"]);
  assertEquals(v.term("provider").values("doc:replaces"), []);
  v.edit("provider").unset("doc:symbol");
  assertEquals(v.terms().where("doc:symbol").exists().ids(), ["harness"]);
});

Deno.test("add y edit sobre un vocabulario leído: el namespace sale de sus términos", () => {
  const v = demo();
  v.add("task").label("Task", "en").definition("What is asked.", "en").broader("run");
  assertEquals(v.term("task").iri, `${NS}task`);
  assertEquals(v.term("task").values("skos:inScheme"), [`${NS}vocabulary`]);
  assertEquals(v.term("run").narrower().ids(), ["task"]);
  assertEquals(v.terms().ids().at(-1), "task");
});

Deno.test("read y write: van y vuelven por el disco", () => {
  const dir = Deno.makeTempDirSync();
  try {
    creado().write(`${dir}/vocabulary.ttl`);
    assertEquals(Deno.readTextFileSync(`${dir}/vocabulary.ttl`), creado().toTurtle());
    assertEquals(triples(Vocabulary.read(`${dir}/vocabulary.ttl`)), triples(creado()));
    assertThrows(() => Vocabulary.read(`${dir}/no-existe.ttl`));
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

// ── Una sola implementación ──────────────────────────────────────────────────────────────────────────────────────

const RAIZ = new URL("..", import.meta.url);

Deno.test("una sola implementación: lo que importan los scripts es la entrada ./vocabulary que se publica", async () => {
  const config = JSON.parse(await Deno.readTextFile(new URL("deno.json", RAIZ)));
  const publicada = config.exports["./vocabulary"];
  assertEquals(publicada, "./vocabulary.ts");
  // El nombre con que la importan los scripts apunta al mismo archivo, y es la misma clase que usa este test.
  assertEquals(config.imports["@kiri23/ontology-client/vocabulary"], publicada);
  const entrada = await import(new URL(publicada, RAIZ).href);
  assert(entrada.Vocabulary === Vocabulary);
  for (const archivo of ["vocabulary.ts", "vocabulary/*.ts"]) assert(config.publish.include.includes(archivo), archivo);
});

Deno.test("una sola implementación: ningún script lee Turtle ni recorre SKOS por su cuenta", async () => {
  const scripts = ["scripts/vocabulario.ts"];
  for await (const e of Deno.readDir(new URL("scripts/vocabulario/", RAIZ))) {
    scripts.push(`scripts/vocabulario/${e.name}`);
  }
  assert(!scripts.includes("scripts/vocabulario/leer.ts"), "leer.ts se borró: leer es de la librería");
  const usan: string[] = [];
  for (const ruta of scripts.sort()) {
    const texto = await Deno.readTextFile(new URL(ruta, RAIZ));
    assert(!/\bParser\b/.test(texto), `${ruta} parsea Turtle por su cuenta`);
    assert(!/vocabulary\.ts["']|vocabulary\/[a-z]+\.ts["']/.test(texto), `${ruta} importa la librería por ruta`);
    if (texto.includes('from "@kiri23/ontology-client/vocabulary"')) usan.push(ruta);
  }
  assertEquals(usan, [
    "scripts/vocabulario.ts",
    "scripts/vocabulario/externo.ts",
    "scripts/vocabulario/renderizar.ts",
    "scripts/vocabulario/todos.ts",
    "scripts/vocabulario/validar.ts",
  ]);
});

Deno.test("una sola implementación: los scripts traducen los problemas de la librería, los del esquema primero", async () => {
  const { enEspanol } = await import("../scripts/vocabulario/validar.ts");
  const roto = `v:uno a skos:ConceptScheme .\n` + termino("a", "skos:inScheme v:uno ; skos:related v:a ;") +
    termino("b");
  const p = problemas(roto, (v) => v.check().oneScheme());
  assertEquals(p.map((x) => x.rule), ["related-self", "in-scheme"]);
  assertEquals(enEspanol(p), [
    `b: tiene 0 skos:inScheme; tiene que tener exactamente uno, <${NS}uno>`,
    "a: skos:related apunta a sí mismo",
  ]);
});
