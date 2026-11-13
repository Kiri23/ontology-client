# Vocabulary API

The entry `@kiri23/ontology-client/vocabulary` reads, queries, checks and creates SKOS vocabularies written in
[Turtle](vocabulary/turtle.md). It knows SKOS and nothing about any repo. `deno task vocabulario` in this repo runs on
it.

It is a separate entry. Importing `@kiri23/ontology-client` does not load it, nor [n3](https://github.com/rdfjs/N3.js),
the library it parses with.

## Read a vocabulary and walk it

```ts
import { Vocabulary } from "jsr:@kiri23/ontology-client@0.3.0/vocabulary";

const vocab = Vocabulary.read("docs/vocabulary.ttl"); // or Vocabulary.parse(ttl), which touches no disk

vocab.terms().ids(); // ["provider", "harness", "endpoint"], in the order of the file
vocab.term("provider").label(); // "Provider"
vocab.term("provider").label("es"); // "Proveedor", or undefined if there is no label in Spanish
vocab.term("provider").definition(); // "Who serves the model."
vocab.term("provider").narrower().ids(); // ["harness", "endpoint"]
vocab.term("harness").ancestors().ids(); // ["provider"]
vocab.has("x"); // false. vocab.term("x") throws and names the terms there are
```

A term is an IRI that is `a skos:Concept`. You ask for it by local name (`"provider"`) or by IRI.

Three things to know about what comes back:

- `label()` and `definition()` return the text as it is written. The library does not trim it, translate it or pick a
  fallback. Without a language you get the first one written; with a language, that one or `undefined`. n3 lowercases
  language tags, so `@en-US` reads as `"en-us"`.
- `narrower()` is worked out. It includes the terms that say `skos:broader` of this one and the ones this term names
  with `skos:narrower`. `broader()` does the same from the other side, and `related()` reads from both ends.
- The relations return terms of this vocabulary. A `skos:broader` that points into another vocabulary is still there as
  an IRI in `term.values("skos:broader")`.

In Deno, n3 needs `--allow-env=READABLE_STREAM`. `read` and `write` need `--allow-read` and `--allow-write`, and they
also run in Node (22.3 or newer). `parse` and `toTurtle` run anywhere, a browser included.

## Predicates and types of your own

A repo usually adds something to its vocabulary. Say yours anchors a term to a symbol in the code with `doc:symbol`, and
describes its hand-written pages as `doc:Page`:

```turtle
@prefix doc: <https://example.com/doc#> .

v:provider a skos:Concept ;
  skos:prefLabel "Provider"@en ;
  doc:symbol "@scope/pkg#Bench.provider" .

doc:intro a doc:Page ; doc:path "tutorial/intro.md" ; dct:references v:provider .
```

The library has no method called `symbol`. You name the predicate, by the prefix the Turtle declares or by its whole
IRI:

```ts
vocab.term("provider").values("doc:symbol"); // ["@scope/pkg#Bench.provider"]
vocab.term("provider").values("https://example.com/doc#symbol"); // the same
vocab.term("provider").literals("skos:prefLabel"); // [{ value: "Provider", language: "en" }]

vocab.terms().where("doc:symbol").missing().ids(); // the terms no symbol is anchored to
vocab.terms().where("doc:symbol").exists(); // still a list of terms: keep chaining
vocab.terms().where("doc:symbol").is("@scope/pkg#Bench.provider").ids(); // ["provider"]

vocab.term("provider").referencedBy("dct:references"); // the pages that use the term
vocab.instancesOf("doc:Page").map((page) => page.values("doc:path")); // [["tutorial/intro.md"]]
vocab.scheme(); // the skos:ConceptScheme, with label() and definition() like a term
```

`skos:`, `rdf:`, `rdfs:` and `dct:` work even if the file does not declare them. Any other prefix the file does not
declare throws, so a typo does not turn into a filter that matches nothing.

When a method falls short, the graph is there. `vocab.store` is the n3 `Store`, not a copy and not a wrapper, and
`vocab.prefixes` are the prefixes of the file. Terms read the store on every call, so they see what you add to it:

```ts
import { DataFactory } from "npm:n3";
const { quad, namedNode } = DataFactory;

vocab.store.addQuad(quad(namedNode("README.md"), namedNode(vocab.iri("dct:references")), vocab.term("provider").node));
vocab.term("provider").referencedBy("dct:references").map((r) => r.iri); // [..., "README.md"]
```

## Check the rules

```ts
const problems = vocab.check()
  .language("en")
  .namespace("https://example.com/vocabulary#")
  .oneScheme()
  .seeAlsoUrls()
  .context(otherVocab) // broader, narrower and related may point to terms of another Vocabulary
  .problems();

for (const p of problems) console.error(p.message);
```

`problems()` returns one object per broken rule, in the order of the file. `passes()` is `problems().length === 0`.

```ts
{ term: "https://example.com/vocabulary#provider", rule: "cardinality",
  message: "provider: has 2 skos:prefLabel in @en; it must have exactly one",
  property: "skos:prefLabel", count: 2, expected: "en" }
```

`rule` is a name that does not change. Use it to count, to skip a rule or to write the message in another language:
`scripts/vocabulario/validar.ts` prints every rule in Spanish that way. `message` is English and ready to print. `term`
is the IRI, or `""` when the problem is of the whole file. The other fields (`property`, `value`, `values`, `found`,
`expected`, `count`) carry what the message talks about.

Some rules are what makes a file SKOS, and `check()` always runs them. The rest are decisions of each repo, one method
each.

| Rule                      | Asked with       | Broken when                                                                    |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `no-concepts`             | always           | the file has no `skos:Concept`. Nothing else is checked                        |
| `not-a-concept`           | always           | something has a `skos:prefLabel` or a `skos:definition` and is not a concept   |
| `blank-node`              | always           | a concept has no IRI                                                           |
| `missing-target`          | always           | `skos:broader`, `skos:narrower` or `skos:related` points to what is not a term |
| `related-self`            | always           | `skos:related` points to the term itself                                       |
| `related-broader-overlap` | always           | two terms are related and one is above the other, at any distance              |
| `broader-cycle`           | always           | following `skos:broader` comes back to the start                               |
| `language`                | `.language()`    | a label or a definition is in another language, or in none                     |
| `cardinality`             | `.language()`    | a term does not have exactly one label, or one definition, in the language     |
| `empty`                   | `.language()`    | the label or the definition is blank                                           |
| `namespace`               | `.namespace()`   | the IRI of a term is outside the namespace                                     |
| `local-name`              | `.namespace()`   | the local name is not lowercase letters, digits and hyphens, or it is `readme` |
| `scheme-count`            | `.oneScheme()`   | the file does not declare exactly one `skos:ConceptScheme`                     |
| `in-scheme`               | `.oneScheme()`   | a term is not `skos:inScheme` of that scheme, and only of it                   |
| `see-also-not-iri`        | `.seeAlsoUrls()` | an `rdfs:seeAlso` is a text or a blank node                                    |
| `see-also-not-http`       | `.seeAlsoUrls()` | an `rdfs:seeAlso` is not an http(s) address                                    |

A `skos:broader` may point to a vocabulary you did not give to `check()`: an IRI in a namespace that none of your terms
use, no `.context()` vocabulary uses, and that is not the one given to `.namespace()`, is trusted and not looked up. A
`skos:broader` to a missing IRI in one of those namespaces is still `missing-target`: that is how a typo shows up. Pass
the other vocabulary with `.context()` and its broaders get checked too.

```turtle
v:harness skos:broader <https://kiri231.com/vocabulario/patron#test-harness> . # a vocabulary not given: fine
v:bench   skos:broader v:benchh .                                              # our namespace, no such term: problem
```

`skos:narrower` and `skos:related` still have to point to a term of this file or of `.context()`.

A rule about your own predicate is not in this table and does not go in the library. Write it on top:

```ts
const unanchored = vocab.terms().where("doc:symbol").missing().ids();
```

## Create and edit

```ts
const fresh = Vocabulary.create("https://example.com/vocabulary#")
  .language("en")
  .prefix("doc", "https://example.com/doc#");

fresh.scheme("vocabulary").label("Demo").definition("The terms of the demo.");
fresh.add("provider").label("Provider").definition("Who serves the model.");
fresh.add("harness").label("Harness").definition("A provider that runs an agent.")
  .broader("provider")
  .value("doc:symbol", "@scope/pkg#Bench.harness");

fresh.edit("harness").altLabel("Arnés", "es");
fresh.remove("harness"); // the term, and every statement that pointed to it

fresh.toTurtle(); // the Turtle as a string
fresh.write("docs/vocabulary.ttl");
```

`add()` and `edit()` return an editor, and each of its methods writes one thing and returns the editor. Getters live on
the term and setters on the editor, so `label()` never means two things on the same object. `label()` and `definition()`
replace the text in the same language; `altLabel()`, `example()`, `seeAlso()`, `broader()`, `related()`, `value()` (a
text) and `link()` (another resource) add one more. `unset(predicate, value?)` takes them back.

A term added while the vocabulary has one concept scheme goes in it. `add()` throws if the name is taken, and `edit()`
if it is not there.

> **`toTurtle()` and `write()` are for files this library creates or generates. Do not use them to rewrite a vocabulary
> written by hand.** The text comes out of the n3 Writer. The comments, the blank lines and the layout of the original
> file are lost. To change a hand-written vocabulary, edit its Turtle.

## What it does not do

There is no migration, no diff between two vocabularies and no rendering to markdown here. Those belong to the repo that
needs them, built on `values()`, `where()`, `instancesOf()` and the store. In this repo the rendering is
`scripts/vocabulario/renderizar.ts`.

## Extending it

The code is `vocabulary.ts` and the folder `vocabulary/`, one file per piece:

| File                  | What is in it                                                  |
| --------------------- | -------------------------------------------------------------- |
| `vocabulary.ts`       | `Vocabulary`: read, parse, create, find, write                 |
| `vocabulary/terms.ts` | `Resource`, `Term`, `Terms` and `Where`: everything that reads |
| `vocabulary/edit.ts`  | `ResourceEditor` and `TermEditor`: everything that writes      |
| `vocabulary/check.ts` | `Check`, `Problem` and each rule                               |
| `vocabulary/names.ts` | prefixes, IRIs and local names                                 |
| `vocabulary/order.ts` | the order in which the file wrote each resource                |

Each file opens with how to add to it. A getter goes in `terms.ts`, named after the SKOS property, and returns what is
written. A setter goes in `edit.ts` and returns the editor. A rule gets a name in `Rule`, a function next to the others
and, if not every vocabulary wants it, a method on `Check`. `tests/vocabulary.test.ts` has one test per rule and per
method.

`Vocabulary` is also the pattern for the modules that may follow it, one per kind of file of the graph (a project, a
technology): [issue #34](https://github.com/Kiri23/ontology-client/issues/34).
