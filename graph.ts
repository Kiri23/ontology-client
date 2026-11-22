/**
 * A graph written in Turtle: the file, with resources of any type in it, a vocabulary among them.
 *
 * ```ts
 * import { Graph, GraphNode } from "jsr:@kiri23/ontology-client/graph";
 *
 * const graph = Graph.inNamespace("https://example.com/scripts#").prefix("ex", "https://example.com/terms#");
 * graph.add(GraphNode.withId("deploy").ofType("ex:Script").value("ex:path", "bin/deploy"));
 * graph.instancesOf("ex:Script").map((s) => s.values("ex:path")); // [["bin/deploy"]]
 * graph.add(vocab); // a Vocabulary of ./vocabulary goes in a graph, not the other way round
 * graph.toTurtle();
 * ```
 *
 * Three pieces: the {@link Graph} (the file), a {@link GraphNode} (what you write about one resource, created on its
 * own and then added) and a {@link Resource} (what you read about one). A type of your own repo is a subclass of
 * GraphNode, in your repo: the library knows no type of anybody's.
 *
 * In Deno, n3 needs `--allow-env=READABLE_STREAM`; `read` and `write` need `--allow-read` and `--allow-write`.
 *
 * @module
 */

// graph.ts — the entry `./graph` of the package: the Graph class and GraphNode (graph/node.ts). It reads and writes
// with the same files of vocabulary/ that vocabulary.ts uses (names, order, Turtle, Resource and its editor), so a
// file comes out the same from either. Nothing here is re-exported from mod.ts, so the client does not load n3.

// @ts-types="@types/n3"
import { DataFactory, type Quad, Store } from "n3";
import { GraphNode } from "./graph/node.ts";
import { ResourceEditor } from "./vocabulary/edit.ts";
import { expand, expandPredicate } from "./vocabulary/names.ts";
import { inOrder, remember } from "./vocabulary/order.ts";
import { instancesOf, Resource, type Source } from "./vocabulary/terms.ts";
import { disk, parseTurtle, writeTurtle } from "./vocabulary/turtle.ts";

export { GraphNode } from "./graph/node.ts";
export { type Literal, Resource, type Source, type SubjectNode } from "./vocabulary/terms.ts";

const { namedNode } = DataFactory;

/** What `graph.add()` copies whole: a Vocabulary, or another Graph. */
export interface Statements {
  /** Every statement it has. */
  readonly store: Store;
  /** The prefixes it declares. */
  readonly prefixes: Readonly<Record<string, string>>;
}

/**
 * A graph: the statements of one Turtle file, about resources of any type.
 *
 * ```ts
 * // Create, add, write
 * const graph = Graph.inNamespace("https://example.com/scripts#").language("en").prefix("ex", "https://example.com/terms#");
 * graph.add(GraphNode.withId("deploy").ofType("ex:Script").label("Deploy"));
 * graph.write("scripts.ttl");
 *
 * // Read
 * Graph.read("scripts.ttl").instancesOf("ex:Script")[0].label(); // "Deploy"
 * ```
 *
 * To add something general, follow what is here: a reading method returns Resources or what is written; a writing
 * method returns the graph, so it chains. Nothing about one repo belongs in this class.
 */
export class Graph implements Source, Statements {
  /**
   * The n3 `Store` with every statement, as it is. Query it or add to it directly when the methods here fall short;
   * resources read from it every time, so they see what you add.
   */
  readonly store: Store;
  /** The prefixes, as prefix → namespace. `toTurtle()` writes them. */
  readonly prefixes: Record<string, string>;
  #namespace?: string;
  #language = "";

  private constructor(quads: Quad[], prefixes: Record<string, string>, namespace?: string) {
    this.store = new Store();
    this.prefixes = prefixes;
    this.#namespace = namespace;
    for (const q of quads) {
      remember(this.store, q.subject.value);
      this.store.addQuad(q);
    }
  }

  /** A graph from Turtle text. It touches no disk. Throws the error of n3, with the line, when it is not Turtle. */
  static parse(turtle: string): Graph {
    const { quads, prefixes } = parseTurtle(turtle);
    return new Graph(quads, prefixes);
  }

  /** A graph from a Turtle file. Runs in Deno and Node; throws like `parse`, and when the file is not there. */
  static read(path: string): Graph {
    return Graph.parse(disk("Graph").readFileSync(path, "utf8"));
  }

  /**
   * An empty graph whose resources will live in `namespace` (`"https://example.com/scripts#"`): a bare name like
   * `"deploy"` goes there. Fill it with `add()`.
   */
  static inNamespace(namespace: string): Graph {
    return new Graph([], {}, namespace);
  }

  /** Where a bare name goes: the one given to `inNamespace`; for a graph that was read, its `:` prefix, if it has one. */
  get namespace(): string | undefined {
    return this.#namespace ?? this.prefixes[""];
  }

  /** The language new labels are written in; `""` when none was set. */
  get defaultLanguage(): string {
    return this.#language;
  }

  /** The IRI a name stands for: a whole IRI stays, `ex:path` expands with its prefix, a bare `deploy` goes in the namespace. */
  iri(name: string): string {
    return expand(name, this.prefixes, name.includes(":") ? undefined : this.namespace);
  }

  /** The IRI of a predicate or a type, by prefix or whole. Throws on a bare name. */
  predicate(name: string): string {
    return expandPredicate(name, this.prefixes);
  }

  // Read

  /** Every resource of a type, by prefix or IRI, in the order they were written: `graph.instancesOf("ex:Script")`. */
  instancesOf(type: string): Resource<Graph>[] {
    return instancesOf(this, type);
  }

  /** Any resource by name, whether or not the graph says something about it. */
  resource(name: string): Resource<Graph> {
    return new Resource(this, namedNode(this.iri(name)));
  }

  // Write

  /** Sets the language new labels are written in (`"en"`, `"es"`). */
  language(tag: string): this {
    this.#language = tag.toLowerCase();
    return this;
  }

  /** Declares a prefix: `.prefix("ex", "https://example.com/terms#")`. */
  prefix(name: string, namespace: string): this {
    this.prefixes[name] = namespace;
    return this;
  }

  /**
   * Puts something in the graph.
   *
   * - A node made with `withId()`: its name and predicates become IRIs here, with the namespace and prefixes of this
   *   graph. Throws when the name is taken or on a prefix this graph does not declare; then nothing of it is written.
   * - A Vocabulary or another Graph: a copy of its statements as they are now, and its prefixes. What it gets later
   *   does not come along. Throws if one of its prefixes means something else here.
   */
  add(what: GraphNode | Statements): this {
    if (what instanceof GraphNode) return this.#addNode(what);
    for (const [name, namespace] of Object.entries(what.prefixes)) {
      if (name in this.prefixes && this.prefixes[name] !== namespace) {
        throw new Error(`The prefix "${name}:" is <${this.prefixes[name]}> here and <${namespace}> in what is added`);
      }
    }
    Object.assign(this.prefixes, what.prefixes);
    const quads = what.store.getQuads(null, null, null, null);
    const subjects = new Map(quads.map((q) => [q.subject.value, q.subject]));
    for (const subject of inOrder(what.store, [...subjects.values()])) remember(this.store, subject.value);
    this.store.addQuads(quads);
    return this;
  }

  /**
   * The graph as Turtle text, one block per resource in the order they were written.
   *
   * **It is for files this library creates or generates, not for rewriting one written by hand**: the comments and
   * the layout of the original are gone.
   */
  toTurtle(): string {
    return writeTurtle(this.store, this.prefixes, this.#namespace);
  }

  /** Writes `toTurtle()` to a file, replacing it. Runs in Deno and Node. */
  write(path: string): void {
    disk("Graph").writeFileSync(path, this.toTurtle());
  }

  /** The node writes itself here; if something it kept is wrong, what it wrote is taken back and the error goes on. */
  #addNode(node: GraphNode): this {
    const subject = namedNode(this.iri(node.id));
    if (this.store.countQuads(subject, null, null, null) > 0) {
      throw new Error(`"${node.id}" is already in this graph (<${subject.value}>)`);
    }
    try {
      node.writeWith(new ResourceEditor(this, subject));
    } catch (error) {
      this.store.removeQuads(this.store.getQuads(subject, null, null, null));
      throw error;
    }
    remember(this.store, subject.value);
    return this;
  }
}
