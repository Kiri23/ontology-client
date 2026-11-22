# Model API

The entry `@kiri23/ontology-client/model` declares a class of your domain in TypeScript (what it is, which properties it
has, what is asked of each) and generates the two files the engine of
[ontologyLearning](https://github.com/Kiri23/ontologyLearning) reads by their name: `ontologia/<class>.ttl`, the class
and its properties, and `ontologia/<class>-reglas.ttl`, its [SHACL](vocabulary/shacl-shape.md) rules. You edit the
`.ts`; the `.ttl` are output.

A property is declared once and lands in both files: `.integer("riegoCadaDias").exactly(1)` gives `rdfs:domain` and
`rdfs:range` in the class, and `sh:datatype`, `sh:minCount` and `sh:maxCount` in the rules.

## The whole model of Planta

The class `jardin:Planta` of [ontology-ejemplo](https://github.com/Kiri23/ontology-ejemplo), declared here, generates
the same graph as its `planta.ttl` and `planta-reglas.ttl` written by hand (`tests/model.test.ts` checks it):

```ts
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
```

It reads top to bottom: a Planta has a label and a comment, its instances live under `planta/`, and it has three
properties. Its name, one text written as `rdfs:label`. Its watering, one integer of 1 or more. Its light, one of three
words. `sh:minInclusive` has no method, so it goes as SHACL written by hand with `.shacl()`.

The instances and the domain, in the same file or in others:

```ts
import { Domain, Model, Shape } from "jsr:@kiri23/ontology-client@0.7.0/model";

const plantas = [
  Planta.withId("pothos").nombre("pothos").riegoCadaDias(7).luz("media"),
  Planta.withId("aloe").nombre("aloe").riegoCadaDias(21).luz("sol"),
];

const jardin = Domain.named("jardin").inFolderOf(import.meta)
  .namespace("https://github.com/Kiri23/ontology-ejemplo/jardin#")
  .model(Planta)
  .query("riego")
  .instances(plantas).toFile("plantas/plantas.ttl");

if (import.meta.main) Deno.exit(jardin.runCli(Deno.args));
```

`Planta.withId("pothos")` gives an instance with one setter per property, typed: `.luz("mucha")` and
`.riegoCadaDias("7")` do not compile. It lives in memory; files are written when the domain generates.

## Generate

The file that declares the domain is the one you run:

```sh
deno run --allow-read=. --allow-write=. --allow-env=READABLE_STREAM dominio.ts          # writes the files
deno run --allow-read=. --allow-write=. --allow-env=READABLE_STREAM dominio.ts --check  # exits 1 if one would change
```

It writes, next to the file given to `inFolderOf(import.meta)`:

| File                          | What                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| `ontologia/planta.ttl`        | the class and the properties in the domain's namespace          |
| `ontologia/planta-reglas.ttl` | `jardin:PlantaShape`, a property shape per property             |
| `plantas/plantas.ttl`         | the instances, where `.toFile()` says (`jardin.ttl` without it) |

Running it prints the folder first and then every file with where it comes from. The folder `ontologia/` and those names
are fixed, because the engine reads them by name, so the code does not say them: the output does. A query is not
written, only asked for, and it says `ok` instead of `wrote`:

```
jardin: files in /…/ontology-ejemplo/
wrote ontologia/planta.ttl         ← model Planta
wrote ontologia/planta-reglas.ttl  ← model Planta
ok    ontologia/riego.rq           ← query "riego" (written by hand)
wrote plantas/plantas.ttl          ← 5 instances
```

`domain.fileOrigins()` gives the same list as a map, without writing.

Generating twice changes nothing: properties come in the order they were declared, instances in the order of their list,
and blank nodes are written inside, as `[ … ]`. The queries are not generated: `.query("riego")` only checks that
`ontologia/riego.rq`, written by hand, is there.

Outside Deno or Node, `domain.toFiles()` gives every file as text, `domain.toGraphs()` as a [Graph](graph-api.md) whose
`store` you can read. `domain.outdatedFiles()` gives the paths that are not up to date.

## What a shape says

The chain has two levels, and the types say which one you are in. First the class:

| Method                                | Writes                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| `label`, `comment`                    | `rdfs:label`, `rdfs:comment` of the class                         |
| `instanceNamespace(ns)`               | nothing: `Planta.withId("pothos")` is `<ns>pothos`                |
| `shacl(turtle)`                       | a NodeShape of its own (`PlantaShape2`…), with its own message    |
| `noExtraProperties()`, `errorMessage` | `sh:closed true`, `sh:ignoredProperties (rdf:type)`, `sh:message` |

Then one property after another, each opened by its kind: `text`, `integer`, `decimal`, `boolean`, `date` (a literal
with its `xsd:` datatype) or `link` (another resource). What follows is about the property opened last:

| Method                                 | Writes                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `writtenAs("rdfs:label")`              | the predicate, when it is not `<namespace><key>`; outside the namespace it is not declared in the class |
| `displayName`, `comment`               | `sh:name` (the key when not said), `rdfs:comment`                                                       |
| `exactly`, `atLeast`, `atMost`         | `sh:minCount`, `sh:maxCount`                                                                            |
| `to(Persona)`, `to("skos:Concept", …)` | `rdfs:range` and `sh:class`; with several, only `sh:or` (two ranges would mean "both")                  |
| `link` without `to`                    | `sh:nodeKind sh:IRI`: any IRI                                                                           |
| `oneOf("sol", "media")`                | `sh:in`, instead of `sh:datatype`; the setter takes only those                                          |
| `errorMessage`                         | `sh:message`                                                                                            |
| `shacl("sh:minInclusive 1")`           | SHACL written by hand, inside the property shape                                                        |

`.shacl()` is Turtle as it is: what goes after the subject, with the prefixes of the domain and `sh:`, `xsd:`, `rdf:`,
`rdfs:`. It is how a rule the builder does not cover gets in without leaving the model, and the files are Graphs, so
`toGraphs()` hands you the n3 `Store` too.

## When things throw

- **A key that is a method of every node** (`label`, `value`, `link`, `ofType`, `id`…) throws in the shape: it would
  hide it. Give another key and say the predicate: `.text("nombre").writtenAs("rdfs:label")`.
- **An instance of a class with `noExtraProperties()` that writes something outside its shape** throws when generating,
  naming the instance and the predicate, instead of failing later in the engine's report. `label()` writes
  `skos:prefLabel`.
- **A query without its `.rq`** throws in `writeFiles` and `outdatedFiles`, and nothing is written.
- **A model that points to one declared further down** has to name it, `.to("Persona")`: when the `static` runs, the
  other class does not exist yet. Declare the one pointed to first and pass the class.

## Import it without JSR

The package imports `n3` by name, so an import map names it too. With a commit of this repo:

```json
{
  "imports": {
    "@kiri23/ontology-client/model": "https://raw.githubusercontent.com/Kiri23/ontology-client/<commit>/model.ts",
    "n3": "npm:n3@^2.13.12",
    "@types/n3": "npm:@types/n3@^1.26.4"
  }
}
```

From a checkout, the first entry is a path relative to that `deno.json`: `"../ontology-client/model.ts"`.

## Extending it

| File              | What is in it                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| `model.ts`        | the entry: what it exports                                               |
| `model/shape.ts`  | `Shape`: the builder, which keeps only data, and the types of its levels |
| `model/model.ts`  | `Model`: `withId` and the setters, a GraphNode underneath                |
| `model/files.ts`  | the data of a shape → the graph of the class and the graph of the rules  |
| `model/domain.ts` | `Domain`: names everything, builds the graphs, writes and checks         |

A kind of property goes in `DATATYPES` of `shape.ts` (a literal) or follows `link` (a resource); what it writes, in
`files.ts`. `tests/model.test.ts` has the tests.
