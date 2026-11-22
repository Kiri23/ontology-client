// Tests de la entrada `./model` del paquete (model.ts y model/): la clase jardin:Planta declarada en TypeScript da
// el mismo grafo que su clase, sus reglas y sus plantas escritas a mano (tests/modelos/planta/, copia de
// Kiri23/ontology-ejemplo); y cada cosa que el ticket #39 pide expresar tiene su test.

import { assert, assertEquals, assertThrows } from "@std/assert";
import { Domain, Model, Shape } from "@kiri23/ontology-client/model";
import { assertMismoGrafo } from "./mismo-grafo.ts";

const ESCRITO = new URL("./modelos/planta/", import.meta.url);
const leer = (path: string) => Deno.readTextFileSync(new URL(path, ESCRITO));

// El modelo de Planta, como lo escribiría ontology-ejemplo. Es el mismo que muestra docs/model-api.md.
class Planta extends Model {
  static shape = Shape.of(Planta)
    .label("Planta")
    .comment("Una planta de la casa: cómo se llama, cada cuántos días se riega y cuánta luz quiere.")
    .instancesIn("https://github.com/Kiri23/ontology-ejemplo/planta/")
    .text("nombre").predicate("rdfs:label").exactly(1)
    .message("Una planta tiene exactamente un nombre (rdfs:label).")
    .integer("riegoCadaDias").name("riego cada días").exactly(1)
    .comment("Cada cuántos días se riega: 7 es una vez por semana.")
    .shacl("sh:minInclusive 1")
    .message("Una planta se riega cada 1 día o más (jardin:riegoCadaDias, un entero).")
    .text("luz").exactly(1).oneOf("sol", "media", "sombra")
    .comment('Cuánta luz quiere: "sol", "media" o "sombra".')
    .message('La luz de una planta es "sol", "media" o "sombra".');
}

const plantas = [
  Planta.create("albahaca").nombre("albahaca").riegoCadaDias(2).luz("sol"),
  Planta.create("helecho").nombre("helecho").riegoCadaDias(3).luz("sombra"),
  Planta.create("pothos").nombre("pothos").riegoCadaDias(7).luz("media"),
  Planta.create("sansevieria").nombre("sansevieria").riegoCadaDias(14).luz("sombra"),
  Planta.create("aloe").nombre("aloe").riegoCadaDias(21).luz("sol"),
];

const jardin = (carpeta: URL) =>
  Domain.create("jardin").at({ url: new URL("dominio.ts", carpeta).href })
    .namespace("https://github.com/Kiri23/ontology-ejemplo/jardin#")
    .model(Planta)
    .query("riego")
    .instances(plantas).in("plantas/plantas.ttl");

/** Una carpeta temporal con el .rq escrito a mano, como la tendría el repo del dominio. */
function carpeta(): URL {
  const dir = Deno.makeTempDirSync({ prefix: "modelo-" });
  Deno.mkdirSync(`${dir}/ontologia`);
  Deno.copyFileSync(new URL("ontologia/riego.rq", ESCRITO), `${dir}/ontologia/riego.rq`);
  return new URL(`file://${dir}/`);
}

Deno.test("Planta en TypeScript da el mismo grafo que su clase, sus reglas y sus plantas escritas a mano", () => {
  const files = jardin(carpeta()).files();
  assertEquals([...files.keys()], ["ontologia/planta.ttl", "ontologia/planta-reglas.ttl", "plantas/plantas.ttl"]);
  for (const [path, turtle] of files) assertMismoGrafo(turtle, leer(path));
});

Deno.test("write deja los archivos al lado del dominio, y generar dos veces no cambia nada", () => {
  const dir = carpeta();
  const dominio = jardin(dir);
  assertEquals(dominio.check(), ["ontologia/planta.ttl", "ontologia/planta-reglas.ttl", "plantas/plantas.ttl"]);
  dominio.write();
  const primera = Deno.readTextFileSync(new URL("ontologia/planta-reglas.ttl", dir));
  assertEquals(jardin(dir).check(), []);
  jardin(dir).write();
  assertEquals(Deno.readTextFileSync(new URL("ontologia/planta-reglas.ttl", dir)), primera);
  assertEquals(jardin(dir).main(["--check"]), 0);
  Deno.writeTextFileSync(new URL("ontologia/planta.ttl", dir), "# editado a mano\n");
  assertEquals(jardin(dir).check(), ["ontologia/planta.ttl"]);
});

Deno.test("una consulta que el dominio nombra tiene que estar escrita en ontologia/<nombre>.rq", () => {
  const dir = carpeta();
  Deno.removeSync(new URL("ontologia/riego.rq", dir));
  assertThrows(() => jardin(dir).write(), Error, "no ontologia/riego.rq");
  assertThrows(() => Domain.create("x").query("../afuera"), Error, "is not a query name");
});

Deno.test("los setters salen de la forma, con el tipo de cada propiedad", () => {
  const pothos = Planta.create("pothos").luz("media").riegoCadaDias(7);
  assert(pothos instanceof Planta);
  assertEquals(pothos.id, "https://github.com/Kiri23/ontology-ejemplo/planta/pothos");
  // @ts-expect-error: la luz es una de tres
  Planta.create("cactus").luz("mucha");
  // @ts-expect-error: el riego es un número
  Planta.create("cactus").riegoCadaDias("7");
  // @ts-expect-error: Planta no tiene altura
  assertThrows(() => Planta.create("cactus").altura(3));
});

// Lo demás que el ticket pide expresar: un enlace a una o varias clases, un IRI cualquiera, clase cerrada con su
// mensaje y una regla sobre el nodo escrita en SHACL crudo. Son las piezas del dominio cursos (ontologyLearning#210).
class Persona extends Model {
  static shape = Shape.of(Persona).text("nombre").predicate("schema:name").exactly(1);
}
class Curso extends Model {
  static shape = Shape.of(Curso)
    .label("Curso")
    .shacl('sh:not [ sh:class ontologia:Proyecto ] ; sh:message "Un curso no es un proyecto."')
    .text("titulo").exactly(1).message("Un curso tiene exactamente un título.")
    .link("enseña").predicate("schema:teaches").to("skos:Concept", "ontologia:Technology").atLeast(1)
    .link("autor").predicate("schema:author").to(Persona).exactly(1)
    .link("evidencia").atLeast(1)
    .closed().message("Un curso no tiene propiedades fuera de su forma.");
}
const cursos = (instancias: Model[]) =>
  Domain.create("cursos").namespace("https://kiri231.com/cursos#")
    .prefix("schema", "https://schema.org/").prefix("ontologia", "https://kiri231.com/ontologia#")
    .model(Persona, Curso)
    .instances(instancias).in((i) => `fichas/${i.id.split("#").at(-1)}.ttl`);

Deno.test("un enlace a una clase, a varias o a cualquier IRI; clase cerrada y una regla en SHACL crudo", () => {
  const files = cursos([]).files();
  assertMismoGrafo(
    files.get("ontologia/curso.ttl")!,
    `@prefix cursos: <https://kiri231.com/cursos#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
     @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
     cursos:Curso a rdfs:Class ; rdfs:label "Curso" .
     cursos:titulo a rdf:Property ; rdfs:domain cursos:Curso ; rdfs:range xsd:string .
     cursos:evidencia a rdf:Property ; rdfs:domain cursos:Curso .`,
  );
  assertMismoGrafo(
    files.get("ontologia/curso-reglas.ttl")!,
    `@prefix cursos: <https://kiri231.com/cursos#> . @prefix sh: <http://www.w3.org/ns/shacl#> .
     @prefix schema: <https://schema.org/> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
     @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
     @prefix ontologia: <https://kiri231.com/ontologia#> .
     cursos:CursoShape a sh:NodeShape ; sh:targetClass cursos:Curso ;
       sh:closed true ; sh:ignoredProperties ( rdf:type ) ;
       sh:message "Un curso no tiene propiedades fuera de su forma." ;
       sh:property [ sh:path cursos:titulo ; sh:name "titulo" ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ;
                     sh:message "Un curso tiene exactamente un título." ] ,
                   [ sh:path schema:teaches ; sh:name "enseña" ; sh:minCount 1 ;
                     sh:or ( [ sh:class skos:Concept ] [ sh:class ontologia:Technology ] ) ] ,
                   [ sh:path schema:author ; sh:name "autor" ; sh:class cursos:Persona ; sh:minCount 1 ; sh:maxCount 1 ] ,
                   [ sh:path cursos:evidencia ; sh:name "evidencia" ; sh:nodeKind sh:IRI ; sh:minCount 1 ] .
     cursos:CursoShape2 a sh:NodeShape ; sh:targetClass cursos:Curso ;
       sh:not [ sh:class ontologia:Proyecto ] ; sh:message "Un curso no es un proyecto." .`,
  );
});

Deno.test("las instancias van al archivo que dice in(), y un enlace acepta otra instancia", () => {
  const karpathy = Persona.create("karpathy").nombre("Andrej Karpathy");
  const curso = Curso.create("zero-to-hero").titulo("Neural Networks: Zero to Hero").autor(karpathy)
    .enseña("ontologia:redes-neuronales").evidencia("https://github.com/Kiri23/KarpathyZeroToHero");
  const files = cursos([karpathy, curso]).files();
  assertEquals([...files.keys()].filter((p) => p.startsWith("fichas/")), [
    "fichas/karpathy.ttl",
    "fichas/zero-to-hero.ttl",
  ]);
  assertMismoGrafo(
    files.get("fichas/zero-to-hero.ttl")!,
    `@prefix cursos: <https://kiri231.com/cursos#> . @prefix schema: <https://schema.org/> .
     cursos:zero-to-hero a cursos:Curso ; cursos:titulo "Neural Networks: Zero to Hero" ;
       schema:author cursos:karpathy ; schema:teaches <https://kiri231.com/ontologia#redes-neuronales> ;
       cursos:evidencia <https://github.com/Kiri23/KarpathyZeroToHero> .`,
  );
});

Deno.test("una instancia de una clase cerrada que escribe algo fuera de su forma lanza al generar", () => {
  const curso = Curso.create("x").titulo("X").label("X");
  assertThrows(() => cursos([curso]).files(), Error, "Curso is closed");
});

Deno.test("la forma lanza donde se escribe mal: un nivel equivocado, un nombre tomado, SHACL que no es Turtle", () => {
  class Mala extends Model {
    static shape = Shape.of(Mala);
  }
  // Los tipos ya no dejan escribir esto; quien lo llame desde JavaScript recibe el mismo aviso.
  const forma = () => Shape.of(Mala) as unknown as Record<string, (...a: unknown[]) => unknown>;
  assertThrows(() => forma().exactly(1), Error, "open one first");
  assertThrows(() => Shape.of(Mala).text("label"), Error, "already a method of every instance");
  assertThrows(() => Shape.of(Mala).text("t").text("t"), Error, "declared twice");
  assertThrows(() => Shape.of(Mala).text("t").to("x:Y"), Error, "to() is for a link");
  const rota = Shape.of(Mala).text("t").shacl("sh:minCount");
  const dominio = Domain.create("d").namespace("https://example.com/d#");
  Object.defineProperty(Mala, "shape", { value: rota });
  assertThrows(() => dominio.model(Mala).files(), Error, "Mala.t: the SHACL in .shacl() is not Turtle");
});

Deno.test("el modelo de Planta de docs/model-api.md es el que prueba este archivo, letra por letra", () => {
  const clase = (texto: string) => texto.match(/^class Planta extends Model \{\n[\s\S]*?\n\}$/m)?.[0];
  const doc = Deno.readTextFileSync(new URL("../docs/model-api.md", import.meta.url));
  const test = Deno.readTextFileSync(new URL(import.meta.url));
  assert(clase(test), "este archivo tiene la clase Planta");
  assertEquals(clase(doc), clase(test));
});
