# Graph API

The entry `@kiri23/ontology-client/graph` writes and reads a graph in [Turtle](vocabulary/turtle.md): one file with
resources of any type in it. A script, a page, a project, and a vocabulary too: a vocabulary is one more resource of the
graph (a `skos:ConceptScheme` and its terms), not the place where a script goes.

The [vocabulary entry](vocabulary-api.md) is built on this one. Like it, importing `@kiri23/ontology-client` does not
load it, nor n3.

## Create a graph and add resources

```ts
import { Graph, ResourceEditor } from "jsr:@kiri23/ontology-client@0.5.0/graph";

const KIRI = "https://kiri231.com/kiri#";
const graph = Graph.create("https://kiri231.com/scripts#").prefix("kiri", KIRI).language("en");

graph.add(ResourceEditor.create("kiri-pm").a("kiri:Script").value("kiri:ruta", "bin/kiri-pm"));
graph.add(ResourceEditor.create("kiri-api").a("kiri:Script").link("kiri:usa", "kiri-pm").label("API"));

graph.instancesOf("kiri:Script").map((s) => s.id); // ["kiri-pm", "kiri-api"]
graph.toTurtle(); // or graph.write("generado/scripts.ttl")
```

It reads like a sentence: `create` names the resource, `a` gives its type, `value` writes a text and `link` points to
another resource. Each method is one thing and returns the same editor, so they chain. `label()`, `definition()`,
`seeAlso()` and `unset()` are there too, the same as on a [term](vocabulary-api.md#create-and-edit).

`Graph.parse(text)` and `Graph.read(path)` open one that exists. `graph.instancesOf(type)` and `graph.resource(name)`
return a `Resource`, the same reader a vocabulary hands out: `values()`, `literals()`, `label()`, `referencedBy()`.

## A type of your own

The library knows no type of anybody's. A type of your repo is a subclass of `ResourceEditor`, and it lives in your
repo: its `create` gives the type, its methods name its predicates.

```ts
class Script extends ResourceEditor {
  static override create(id: string): Script {
    return new Script(id).a("kiri:Script");
  }
  ruta(p: string): this {
    return this.value("kiri:ruta", p);
  }
}

graph.add(Script.create("kiri-pm").ruta("bin/kiri-pm").label("Project manager"));
```

Every method of the base returns `this`, so `.label()` gives back a `Script` and `.ruta()` still works after it. Deno
asks for `override` on the `create` of the subclass.

## A vocabulary in a graph

```ts
import { Vocabulary } from "jsr:@kiri23/ontology-client@0.5.0/vocabulary";

const vocab = Vocabulary.read("docs/vocabulary.ttl");
graph.add(vocab);
graph.instancesOf("skos:Concept"); // its terms, next to the scripts
```

`add` copies the statements and the prefixes the vocabulary has at that moment. What the vocabulary gets afterwards does
not come along, and the vocabulary does not get anything from the graph. A prefix that means one thing in the graph and
another in the vocabulary throws. Another `Graph` goes in the same way.

## When names become IRIs, and what throws

A resource made with `create()` is on its own until `graph.add()` takes it. Three things follow from that:

- **Its IRI is decided in the `add`.** `"kiri-pm"` goes in the namespace of the graph that receives it, and `kiri:ruta`
  expands with that graph's prefixes, so a prefix declared after `create()` still works. Before the `add`, `id` is the
  name you gave and `iri`, `node` and `graph` throw. A prefix the graph does not know throws in the `add`, and nothing
  of that resource is written.
- **A forgotten `add` is not silent.** `toTurtle()` and `write()` of any graph throw while a resource made with
  `create()` has not been added, naming it. Add every resource before writing any graph.
- **After the `add`, it writes straight in.** `pm.ruta("bin/pm")` on a script already in the graph changes the graph.

`add` also throws when the name is taken in the graph, and when the resource is already in a graph. `a("Script")` throws
right away: a type without a prefix would go in the namespace of the resources.

> **`toTurtle()` and `write()` are for files this library creates or generates**, like the ones in `generado/`. The text
> comes out of the n3 Writer: the comments and the layout of a file written by hand are lost.

## Extending it

The code is `graph.ts` and the folder `graph/`. `vocabulary.ts` and `vocabulary/` are built on it.

| File                | What is in it                                                       |
| ------------------- | ------------------------------------------------------------------- |
| `graph.ts`          | `Graph`: parse, read, create, add, find, write                      |
| `graph/resource.ts` | `Resource`: everything that reads one resource                      |
| `graph/editor.ts`   | `ResourceEditor`: everything that writes one, inside a graph or not |
| `graph/turtle.ts`   | Turtle in and out, and the disk                                     |
| `graph/names.ts`    | prefixes, IRIs and local names                                      |
| `graph/order.ts`    | the order in which each resource was written                        |

A getter goes in `resource.ts` and a setter in `editor.ts`, through `set`, `add` or `addText` so it waits for the `add`
when the resource is on its own. A type of one repo does not go here: it is a subclass in that repo.
`tests/graph.test.ts` has the tests.

Turtle only: a TriG file, with named graphs, is not read or written yet.
