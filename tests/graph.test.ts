// Tests de la entrada `./graph` del paquete (graph.ts y graph/): un grafo con recursos de cualquier tipo, creados
// sueltos con `create()` y puestos con `graph.add()`; un tipo propio como subclase (Script, que en la vida real vive
// en el repo que lo usa, no en la librería); un vocabulario adentro de un grafo; y la ida y vuelta por Turtle.
//
// Los riesgos de la forma builder tienen su test: el IRI se decide en el `add`, un nodo que nunca se agregó no le
// rompe nada a ningún grafo, y los métodos de la base devuelven el tipo de la subclase.

import { assert, assertEquals, assertThrows } from "@std/assert";
import { Graph, GraphNode } from "@kiri23/ontology-client/graph";
import { Vocabulary } from "@kiri23/ontology-client/vocabulary";
import { assertMismoGrafo } from "./mismo-grafo.ts";

const NS = "https://kiri231.com/scripts#";
const KIRI = "https://kiri231.com/kiri#";

// Un tipo propio, como lo escribiría el repo que lo usa: su create da el tipo, sus métodos nombran sus predicados.
class Script extends GraphNode {
  static override create(id: string): Script {
    return new Script(id).a("kiri:Script");
  }
  ruta(p: string): this {
    return this.value("kiri:ruta", p);
  }
}

const grafo = () => Graph.create(NS).prefix("kiri", KIRI).language("en");

Deno.test("create, a, value y link: un recurso suelto entra al grafo con add y se vuelve a leer", () => {
  const graph = grafo();
  graph.add(GraphNode.create("kiri-pm").a("kiri:Script").value("kiri:ruta", "bin/kiri-pm"));
  graph.add(GraphNode.create("kiri-api").a("kiri:Script").link("kiri:usa", "kiri-pm").label("API"));

  assertEquals(graph.instancesOf("kiri:Script").map((s) => s.iri), [`${NS}kiri-pm`, `${NS}kiri-api`]);
  const pm = graph.resource("kiri-pm");
  assertEquals(pm.types(), [`${KIRI}Script`]);
  assertEquals(pm.values("kiri:ruta"), ["bin/kiri-pm"]);
  assertEquals(graph.resource("kiri-api").values("kiri:usa"), [`${NS}kiri-pm`]);
  assertEquals(graph.resource("kiri-api").literals("skos:prefLabel"), [{ value: "API", language: "en" }]);
  assertEquals(pm.referencedBy("kiri:usa").map((r) => r.id), ["kiri-api"]);
});

Deno.test("subclase con create: Script.create da el tipo y sus métodos, y label no le borra ruta", () => {
  const graph = grafo();
  // Riesgo 3: si label() devolviera GraphNode, .ruta() después no compilaría y este test no correría.
  const pm: Script = Script.create("kiri-pm").label("Project manager").ruta("bin/kiri-pm");
  graph.add(pm);
  graph.add(Script.create("kiri-api").ruta("bin/kiri-api"));

  assert(pm instanceof Script);
  assertEquals(graph.instancesOf("kiri:Script").map((s) => [s.id, s.values("kiri:ruta"), s.label()]), [
    ["kiri-pm", ["bin/kiri-pm"], "Project manager"],
    ["kiri-api", ["bin/kiri-api"], undefined],
  ]);
});

Deno.test("después del add el nodo no se escribe más: lanza en vez de perder lo escrito", () => {
  const graph = grafo();
  const pm = Script.create("kiri-pm").ruta("bin/kiri-pm");
  graph.add(pm);
  assertThrows(() => pm.ruta("bin/pm"), Error, '"kiri-pm" is already in a graph');
  assertEquals(graph.resource("kiri-pm").values("kiri:ruta"), ["bin/kiri-pm"]);
  assertEquals(graph.resource("kiri-pm").vocabulary, graph, "un recurso dice de qué grafo se leyó");
});

Deno.test("riesgo 1: el IRI y los prefijos se resuelven en el add, con el namespace del grafo que lo recibe", () => {
  const pm = Script.create("kiri-pm").ruta("bin/kiri-pm");
  assertEquals(pm.id, "kiri-pm");

  // El prefijo kiri se declara después de crear el script: igual anda, porque nada se resolvió todavía.
  const graph = Graph.create(NS);
  graph.prefix("kiri", KIRI).add(pm);
  assertEquals(graph.resource("kiri-pm").iri, `${NS}kiri-pm`);
  assertEquals(graph.resource("kiri-pm").values("kiri:ruta"), ["bin/kiri-pm"]);
});

Deno.test("riesgo 1: un prefijo que el grafo no conoce lanza en el add y el grafo queda como estaba", () => {
  const graph = Graph.create(NS);
  const pm = Script.create("kiri-pm").ruta("bin/kiri-pm");
  assertThrows(() => graph.add(pm), Error, 'Unknown prefix "kiri:"');
  assertEquals(graph.store.size, 0);

  // Declarado el prefijo, el mismo script entra entero.
  graph.prefix("kiri", KIRI).add(pm);
  assertEquals(graph.instancesOf("kiri:Script").map((s) => s.values("kiri:ruta")), [["bin/kiri-pm"]]);
});

Deno.test("riesgo 2: un nodo que nunca se agregó, o que falló al crearse, no le rompe nada a ningún grafo", () => {
  const graph = grafo();
  graph.add(Script.create("kiri-pm"));
  // Antes, la librería anotaba cada nodo creado en una lista del proceso y estos dos dejaban a todo grafo sin escribir.
  assertThrows(() => GraphNode.create("roto").a("Bad"), Error, '"Bad" is not a type');
  Script.create("kiri-api").ruta("bin/kiri-api");

  assert(graph.toTurtle().includes(":kiri-pm a kiri:Script"));
  assert(!graph.toTurtle().includes("kiri-api"), "lo que no pasó por add no está en el archivo");
  assertEquals(
    grafo().toTurtle(),
    "@prefix kiri: <https://kiri231.com/kiri#>.\n@prefix : <https://kiri231.com/scripts#>.\n\n",
  );
});

Deno.test("add lanza con un nombre tomado; el mismo nodo entra en otro grafo, con el namespace de ese", () => {
  const graph = grafo();
  const pm = Script.create("kiri-pm");
  graph.add(pm);
  assertThrows(() => graph.add(pm), Error, '"kiri-pm" is already in this graph');
  assertThrows(() => graph.add(Script.create("kiri-pm")), Error, '"kiri-pm" is already in this graph');

  const otro = Graph.create("https://otra.dev/#").prefix("kiri", KIRI).add(pm);
  assertEquals(otro.instancesOf("kiri:Script").map((s) => s.iri), ["https://otra.dev/#kiri-pm"]);
});

Deno.test("graph.add(vocab): un grafo contiene un vocabulario, con sus prefijos, sin que el vocabulario cambie", () => {
  const vocab = Vocabulary.create("https://kiri231.com/vocabulario#").language("en");
  vocab.scheme("vocabulario").label("Kiri");
  vocab.add("script").label("Script").definition("A program in bin/.");
  const antes = vocab.toTurtle();

  const graph = grafo();
  graph.add(Script.create("kiri-pm").link("dct:subject", "https://kiri231.com/vocabulario#script"));
  graph.add(vocab);

  assertEquals(graph.instancesOf("skos:Concept").map((t) => t.label()), ["Script"]);
  assertEquals(graph.instancesOf("skos:ConceptScheme").map((s) => s.id), ["vocabulario"]);
  assertEquals(graph.instancesOf("kiri:Script").map((s) => s.id), ["kiri-pm"]);
  assertEquals(vocab.toTurtle(), antes, "el vocabulario no recibe nada del grafo");
  assertEquals(vocab.edit("script").vocabulary, vocab, "un término sigue diciendo de qué vocabulario es");
  assertEquals(vocab.term("script").vocabulary, vocab);

  // Lo que el vocabulario gana después no viaja: add copia lo que tiene en ese momento.
  vocab.add("bin").label("Bin");
  assertEquals(graph.instancesOf("skos:Concept").length, 1);

  // Un prefijo que significa otra cosa en el grafo lanza en vez de pisarse.
  const choca = Vocabulary.parse(
    "@prefix kiri: <https://otra.dev/#> . kiri:x a <http://www.w3.org/2004/02/skos/core#Concept> .",
  );
  assertThrows(() => graph.add(choca), Error, 'The prefix "kiri:"');
});

Deno.test("ida y vuelta por Turtle: lo escrito se vuelve a leer igual, en el mismo orden", () => {
  const graph = grafo();
  graph.add(Script.create("kiri-pm").label("Project manager").ruta("bin/kiri-pm"));
  graph.add(Script.create("kiri-api").ruta("bin/kiri-api").link("kiri:usa", "kiri-pm"));
  const turtle = graph.toTurtle();
  assert(/:kiri-pm a kiri:Script/.test(turtle), "el tipo va primero en su bloque");

  const vuelta = Graph.parse(turtle);
  assertEquals(vuelta.namespace, NS, "el namespace vuelve como el prefijo :");
  assertEquals(vuelta.instancesOf("kiri:Script").map((s) => [s.id, s.values("kiri:ruta"), s.values("kiri:usa")]), [
    ["kiri-pm", ["bin/kiri-pm"], []],
    ["kiri-api", ["bin/kiri-api"], [`${NS}kiri-pm`]],
  ]);
  assertEquals(vuelta.toTurtle(), turtle);

  // Un grafo leído sigue recibiendo recursos con nombre suelto, en su namespace.
  vuelta.add(Script.create("kiri-ojos"));
  assertEquals(vuelta.resource("kiri-ojos").types(), [`${KIRI}Script`]);
});

Deno.test("read y write: el archivo en disco", () => {
  const dir = Deno.makeTempDirSync();
  try {
    const path = `${dir}/scripts.ttl`;
    grafo().add(Script.create("kiri-pm").ruta("bin/kiri-pm")).write(path);
    assertEquals(Graph.read(path).resource("kiri-pm").values("kiri:ruta"), ["bin/kiri-pm"]);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("toTurtle escribe adentro un nodo en blanco que apunta un solo triple, y una lista como ( … )", () => {
  const reglas = Deno.readTextFileSync(new URL("./modelos/planta/planta-reglas.ttl", import.meta.url));
  const turtle = Graph.parse(reglas).toTurtle();
  assert(!turtle.includes("_:"), turtle);
  assert(turtle.includes('sh:in ("sol" "media" "sombra")'), turtle);
  assert(!turtle.includes("@prefix rdf:"), "rdf: no se usa: una lista se escribe sin rdf:first");
  assertMismoGrafo(turtle, reglas);
});

Deno.test("toTurtle: un nodo en blanco que apuntan dos triples, o que solo se apunta a sí mismo, conserva su etiqueta", () => {
  const turtle = `@prefix ex: <https://example.com/#> .
    ex:a ex:p _:compartido . ex:b ex:p _:compartido . _:compartido ex:q "x" .
    _:ciclo ex:r _:ciclo .`;
  const salida = Graph.parse(turtle).toTurtle();
  assertMismoGrafo(salida, turtle);
  assertEquals(Graph.parse(salida).store.size, 4);
});
