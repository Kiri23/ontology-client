// Tests de la entrada `./model` del paquete (model.ts y model/): la clase jardin:Planta declarada en TypeScript da
// el mismo grafo que su clase, sus reglas y sus plantas escritas a mano (tests/modelos/planta/, copia de
// Kiri23/ontology-ejemplo); y cada cosa que el ticket #39 pide expresar tiene su test.

import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Domain, Model, Shape } from "@kiri23/ontology-client/model";
import { assertMismoGrafo } from "./mismo-grafo.ts";

const ESCRITO = new URL("./modelos/planta/", import.meta.url);
const leer = (path: string) => Deno.readTextFileSync(new URL(path, ESCRITO));

// El modelo de Planta, como lo escribiría ontology-ejemplo. Es el mismo que muestra docs/model-api.md.
class Planta extends Model {
  static shape = Shape.of(Planta)
    .label("Planta")
    .comment("Una planta de la casa: cómo se llama, cada cuántos días se riega y cuánta luz quiere.")
    .instanceNamespace("https://github.com/Kiri23/ontology-ejemplo/planta/")
    .text("nombre").writtenAs("rdfs:label").exactly(1)
    .errorMessage("Una planta tiene exactamente un nombre (rdfs:label).")
    .integer("riegoCadaDias").displayName("riego cada días").exactly(1)
    .comment("Cada cuántos días se riega: 7 es una vez por semana.")
    .shacl("sh:minInclusive 1")
    .errorMessage("Una planta se riega cada 1 día o más (jardin:riegoCadaDias, un entero).")
    .text("luz").exactly(1).oneOf("sol", "media", "sombra")
    .comment('Cuánta luz quiere: "sol", "media" o "sombra".')
    .errorMessage('La luz de una planta es "sol", "media" o "sombra".');
}

const plantas = [
  Planta.withId("albahaca").nombre("albahaca").riegoCadaDias(2).luz("sol"),
  Planta.withId("helecho").nombre("helecho").riegoCadaDias(3).luz("sombra"),
  Planta.withId("pothos").nombre("pothos").riegoCadaDias(7).luz("media"),
  Planta.withId("sansevieria").nombre("sansevieria").riegoCadaDias(14).luz("sombra"),
  Planta.withId("aloe").nombre("aloe").riegoCadaDias(21).luz("sol"),
];

const jardin = (carpeta: URL) =>
  Domain.named("jardin").inFolderOf({ url: new URL("dominio.ts", carpeta).href })
    .namespace("https://github.com/Kiri23/ontology-ejemplo/jardin#")
    .model(Planta)
    .query("riego")
    .instances(plantas).toFile("plantas/plantas.ttl");

/** Una carpeta temporal con el .rq escrito a mano, como la tendría el repo del dominio. */
function carpeta(): URL {
  const dir = Deno.makeTempDirSync({ prefix: "modelo-" });
  Deno.mkdirSync(`${dir}/ontologia`);
  Deno.copyFileSync(new URL("ontologia/riego.rq", ESCRITO), `${dir}/ontologia/riego.rq`);
  return new URL(`file://${dir}/`);
}

Deno.test("Planta en TypeScript da el mismo grafo que su clase, sus reglas y sus plantas escritas a mano", () => {
  const files = jardin(carpeta()).toFiles();
  assertEquals([...files.keys()], ["ontologia/planta.ttl", "ontologia/planta-reglas.ttl", "plantas/plantas.ttl"]);
  for (const [path, turtle] of files) assertMismoGrafo(turtle, leer(path));
});

Deno.test("writeFiles deja los archivos al lado del dominio, y generar dos veces no cambia nada", () => {
  const dir = carpeta();
  const dominio = jardin(dir);
  assertEquals(dominio.outdatedFiles(), ["ontologia/planta.ttl", "ontologia/planta-reglas.ttl", "plantas/plantas.ttl"]);
  dominio.writeFiles();
  const primera = Deno.readTextFileSync(new URL("ontologia/planta-reglas.ttl", dir));
  assertEquals(jardin(dir).outdatedFiles(), []);
  jardin(dir).writeFiles();
  assertEquals(Deno.readTextFileSync(new URL("ontologia/planta-reglas.ttl", dir)), primera);
  assertEquals(jardin(dir).runCli(["--check"]), 0);
  Deno.writeTextFileSync(new URL("ontologia/planta.ttl", dir), "# editado a mano\n");
  assertEquals(jardin(dir).outdatedFiles(), ["ontologia/planta.ttl"]);
  assertEquals(jardin(dir).runCli(["--check"]), 1);
});

Deno.test("runCli: un argumento que no es --check lanza y no escribe nada", () => {
  const dir = carpeta();
  assertThrows(() => jardin(dir).runCli(["--chek"]), Error, '"--chek" is not an argument');
  assertEquals(jardin(dir).outdatedFiles().length, 3, "no escribió ningún archivo");
});

Deno.test("una consulta que el dominio nombra tiene que estar escrita en ontologia/<nombre>.rq", () => {
  const dir = carpeta();
  Deno.removeSync(new URL("ontologia/riego.rq", dir));
  assertThrows(() => jardin(dir).writeFiles(), Error, "no ontologia/riego.rq");
  assertThrows(() => Domain.named("x").query("../afuera"), Error, "is not a query name");
});

Deno.test("los setters salen de la forma, con el tipo de cada propiedad", () => {
  const pothos = Planta.withId("pothos").luz("media").riegoCadaDias(7);
  assert(pothos instanceof Planta);
  assertEquals(pothos.id, "https://github.com/Kiri23/ontology-ejemplo/planta/pothos");
  // @ts-expect-error: la luz es una de tres
  Planta.withId("cactus").luz("mucha");
  // @ts-expect-error: el riego es un número
  Planta.withId("cactus").riegoCadaDias("7");
  // @ts-expect-error: Planta no tiene altura
  assertThrows(() => Planta.withId("cactus").altura(3));
});

// Lo demás que el ticket pide expresar: un enlace a una o varias clases, un IRI cualquiera, clase cerrada con su
// mensaje y una regla sobre el nodo escrita en SHACL crudo. Son las piezas del dominio cursos (ontologyLearning#210).
class Persona extends Model {
  static shape = Shape.of(Persona).text("nombre").writtenAs("schema:name").exactly(1);
}
class Curso extends Model {
  static shape = Shape.of(Curso)
    .label("Curso")
    .shacl('sh:not [ sh:class ontologia:Proyecto ] ; sh:message "Un curso no es un proyecto."')
    .text("titulo").exactly(1).errorMessage("Un curso tiene exactamente un título.")
    .link("enseña").writtenAs("schema:teaches").to("skos:Concept", "ontologia:Technology").atLeast(1)
    .link("autor").writtenAs("schema:author").to(Persona).exactly(1)
    .link("evidencia").atLeast(1)
    .noExtraProperties().errorMessage("Un curso no tiene propiedades fuera de su forma.");
}
const cursos = (instancias: Model[]) =>
  Domain.named("cursos").namespace("https://kiri231.com/cursos#")
    .prefix("schema", "https://schema.org/").prefix("ontologia", "https://kiri231.com/ontologia#")
    .model(Persona, Curso)
    .instances(instancias).toFile((i) => `fichas/${i.id.split("#").at(-1)}.ttl`);

Deno.test("un enlace a una clase, a varias o a cualquier IRI; clase cerrada y una regla en SHACL crudo", () => {
  const files = cursos([]).toFiles();
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

Deno.test("las instancias van al archivo que dice toFile(), y un enlace acepta otra instancia", () => {
  const karpathy = Persona.withId("karpathy").nombre("Andrej Karpathy");
  const curso = Curso.withId("zero-to-hero").titulo("Neural Networks: Zero to Hero").autor(karpathy)
    .enseña("ontologia:redes-neuronales").evidencia("https://github.com/Kiri23/KarpathyZeroToHero");
  const files = cursos([karpathy, curso]).toFiles();
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
  const curso = Curso.withId("x").titulo("X").label("X");
  assertThrows(() => cursos([curso]).toFiles(), Error, "Curso says noExtraProperties()");
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
  const dominio = Domain.named("d").namespace("https://example.com/d#");
  Object.defineProperty(Mala, "shape", { value: rota });
  assertThrows(() => dominio.model(Mala).toFiles(), Error, "Mala.t: the SHACL in .shacl() is not Turtle");
});

Deno.test("ofType es un método de toda instancia y no puede ser clave; a, que era el nombre viejo, queda libre", () => {
  class Mala extends Model {
    static shape = Shape.of(Mala);
  }
  assertThrows(() => Shape.of(Mala).text("ofType"), Error, '"ofType" is already a method of every instance');

  class Nota extends Model {
    static shape = Shape.of(Nota).text("a").exactly(1);
  }
  const files = Domain.named("d").namespace("https://example.com/d#").model(Nota)
    .instances([Nota.withId("n").a("primera")]).toFiles();
  assertStringIncludes(files.get("d.ttl")!, 'd:a "primera"');
});

Deno.test("el modelo de Planta de docs/model-api.md es el que prueba este archivo, letra por letra", () => {
  const clase = (texto: string) => texto.match(/^class Planta extends Model \{\n[\s\S]*?\n\}$/m)?.[0];
  const doc = Deno.readTextFileSync(new URL("../docs/model-api.md", import.meta.url));
  const test = Deno.readTextFileSync(new URL(import.meta.url));
  assert(clase(test), "este archivo tiene la clase Planta");
  assertEquals(clase(doc), clase(test));
});

Deno.test("rdfs:range de un enlace del namespace propio: con una clase sale, con dos no", () => {
  class Taller extends Model {
    static shape = Shape.of(Taller)
      .link("dictadoPor").to(Persona)
      .link("sobre").to(Persona, "skos:Concept");
  }
  const files = cursos([]).model(Taller).toFiles();
  assertMismoGrafo(
    files.get("ontologia/taller.ttl")!,
    `@prefix cursos: <https://kiri231.com/cursos#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
     @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
     cursos:Taller a rdfs:Class .
     cursos:dictadoPor a rdf:Property ; rdfs:domain cursos:Taller ; rdfs:range cursos:Persona .
     cursos:sobre a rdf:Property ; rdfs:domain cursos:Taller .`,
  );
});

Deno.test("dos modelos con la misma propiedad del namespace propio lanzan; una prestada se comparte", () => {
  class Charla extends Model {
    static shape = Shape.of(Charla).text("titulo").link("autor").writtenAs("schema:author");
  }
  assertThrows(() => cursos([]).model(Charla).toGraphs(), Error, "is a property of Curso and of Charla");
  class Libro extends Model {
    static shape = Shape.of(Libro).text("nombre").writtenAs("schema:name").link("autor").writtenAs("schema:author");
  }
  assert(cursos([]).model(Libro).toGraphs().has("ontologia/libro.ttl"));
});
