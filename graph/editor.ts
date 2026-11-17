// editor.ts — what you write on a resource. A ResourceEditor is born in one of two ways:
//
// - inside a graph, when `vocabulary.scheme(id)` or `vocabulary.add()` hand one out: each method writes right away;
// - on its own, with `ResourceEditor.create(id)` (or the `create` of a subclass, like `Script.create`): it keeps what
//   you write until `graph.add()` puts it in a graph, and only there its name and its predicates become IRIs.
//
// Every method writes one thing and returns the editor, so they chain. Reading lives in resource.ts and writing here,
// so `label()` never means two things on the same object.
//
// To add a setter, follow the ones here: a method named after the property, in the singular, that calls `set` (one
// value per language), `add` (as many as you write) or `addText` (a text in the language of the graph).

// @ts-types="@types/n3"
import { DataFactory, type Quad } from "n3";
import { localName, RDF_TYPE, RDFS, SKOS } from "./names.ts";
import { remember } from "./order.ts";
import type { Source, SubjectNode } from "./resource.ts";

const { namedNode, literal, quad } = DataFactory;

/** The editors created on their own that no graph has taken yet, so writing a graph can say one was forgotten. */
const LOOSE = new Set<ResourceEditor>();

/** The names of the resources created with `create()` that were never given to `graph.add()`. Graph uses it. */
export function loose(): string[] {
  return [...LOOSE].map((editor) => editor.id);
}

/** Puts an editor created on its own in a graph. Only `graph.add()` calls it. */
export let attach: (editor: ResourceEditor, graph: Source) => void;

/**
 * Writes on a resource: the concept scheme (`vocab.scheme(id)`), or a resource of any type, created on its own and
 * then added to a graph.
 *
 * ```ts
 * const graph = Graph.create("https://example.com/doc#").prefix("doc", "https://example.com/doc#");
 * graph.add(ResourceEditor.create("intro").a("doc:Page").value("doc:path", "tutorial/intro.md"));
 *
 * // A type of your own repo is a subclass: its create gives the type, its methods name its predicates.
 * class Page extends ResourceEditor {
 *   static override create(id: string): Page {
 *     return new Page(id).a("doc:Page");
 *   }
 *   path(p: string): this {
 *     return this.value("doc:path", p);
 *   }
 * }
 * graph.add(Page.create("guide").path("guide.md").label("Guide"));
 * ```
 */
export class ResourceEditor {
  #graph?: Source;
  #node?: SubjectNode;
  readonly #name: string;
  #pending: (() => void)[] = [];

  /**
   * With a name, an editor on its own: `graph.add()` puts it in a graph later. With a graph and a node, an editor
   * that writes there right away; `vocabulary.add()`, `edit()` and `scheme(id)` build those.
   */
  constructor(id: string);
  constructor(graph: Source, node: SubjectNode);
  constructor(where: string | Source, node?: SubjectNode) {
    if (typeof where === "string") {
      this.#name = where;
      LOOSE.add(this);
    } else {
      this.#graph = where;
      this.#node = node!;
      this.#name = node!.value;
    }
  }

  /**
   * A resource on its own, to fill and then give to `graph.add()`. The name goes bare (`"intro"`, in the namespace of
   * the graph), by prefix or as a whole IRI; it becomes an IRI when it is added.
   *
   * A subclass writes its own `create` that calls `new` and gives its type: `new Page(id).a("doc:Page")`.
   */
  static create(id: string): ResourceEditor {
    return new ResourceEditor(id);
  }

  static {
    attach = (editor, graph) => editor.#attach(graph);
  }

  /** The graph it writes on. Throws while it is not in one: `graph.add()` it first. */
  get graph(): Source {
    if (!this.#graph) throw this.#notYet("graph");
    return this.#graph;
  }

  /** The n3 node being written on. Throws while it is not in a graph, like `graph`. */
  get node(): SubjectNode {
    if (!this.#node) throw this.#notYet("node");
    return this.#node;
  }

  /** The whole IRI of what is being edited. Throws while it is not in a graph: the graph decides it. */
  get iri(): string {
    return this.node.value;
  }

  /** Its local name; before it is in a graph, the name it was created with. */
  get id(): string {
    return this.#node ? localName(this.#node.value) : this.#name;
  }

  /** Adds a type (`a doc:Page`), by prefix or whole IRI. Throws on a bare name: it is not a type. */
  a(type: string): this {
    if (!type.includes(":")) {
      throw new Error(`"${type}" is not a type: write it with its prefix ("doc:${type}") or as a whole IRI`);
    }
    return this.#write(() => this.#addNow(RDF_TYPE, namedNode(this.graph.predicate(type))));
  }

  /**
   * Sets the `skos:prefLabel`. It replaces the one in the same language and leaves the others. Without a language,
   * the text goes in the one set with `graph.language()`.
   */
  label(text: string, language?: string): this {
    return this.set(`${SKOS}prefLabel`, text, language);
  }

  /** Sets the `skos:definition`; replaces the one in the same language, like `label()`. */
  definition(text: string, language?: string): this {
    return this.set(`${SKOS}definition`, text, language);
  }

  /** Adds an `rdfs:seeAlso` link. */
  seeAlso(url: string): this {
    return this.link(`${RDFS}seeAlso`, url);
  }

  /**
   * Adds a text for any predicate, by prefix or whole IRI: `.value("doc:symbol", "@scope/pkg#Bench.provider")`.
   * It gets a language only if you pass one. This is how you write a predicate of your own repo.
   */
  value(predicate: string, text: string, language?: string): this {
    return this.add(predicate, literal(text, language));
  }

  /** Adds a link to another resource for any predicate. The target goes by local name, by prefix or as an IRI. */
  link(predicate: string, target: string): this {
    return this.#write(() => this.#addNow(predicate, namedNode(this.graph.iri(target))));
  }

  /**
   * Takes back what was written for a predicate: one value (a text, or the name of a resource), or all of them when
   * you pass none.
   */
  unset(predicate: string, value?: string): this {
    return this.#write(() => {
      const { store } = this.graph;
      const written = store.getQuads(this.node, namedNode(this.graph.predicate(predicate)), null, null);
      store.removeQuads(value === undefined ? written : written.filter((q) => this.#is(q.object, value)));
    });
  }

  /** For the setters of one value per language: writes the text and drops the one that was in that language. */
  protected set(predicate: string, text: string, language?: string): this {
    return this.#write(() => {
      const tag = (language ?? this.graph.defaultLanguage).toLowerCase();
      const { store } = this.graph;
      const before = store.getQuads(this.node, namedNode(this.graph.predicate(predicate)), null, null);
      store.removeQuads(before.filter((q) => q.object.termType === "Literal" && q.object.language === tag));
      this.#addNow(predicate, literal(text, tag || undefined));
    });
  }

  /** For the setters of many values: writes one more statement. */
  protected add(predicate: string, object: Quad["object"]): this {
    return this.#write(() => this.#addNow(predicate, object));
  }

  /** For the setters of many texts: one more, in the language of the graph when you pass none. */
  protected addText(predicate: string, text: string, language?: string): this {
    return this.#write(() => {
      const tag = (language ?? this.graph.defaultLanguage).toLowerCase();
      this.#addNow(predicate, literal(text, tag || undefined));
    });
  }

  /** In a graph, writes now; on its own, keeps it for when `graph.add()` takes it. */
  #write(write: () => void): this {
    if (this.#graph) write();
    else this.#pending.push(write);
    return this;
  }

  #addNow(predicate: string, object: Quad["object"]): void {
    this.graph.store.addQuad(quad(this.node, namedNode(this.graph.predicate(predicate)), object));
  }

  /**
   * Gives the editor its graph and its IRI, and writes there what it kept. If something it kept is wrong (a prefix
   * the graph does not know), it takes back what it wrote and throws, so the graph is left as it was.
   */
  #attach(graph: Source): void {
    if (this.#graph) throw new Error(`"${this.id}" is already in a graph (<${this.iri}>): add it once`);
    const node = namedNode(graph.iri(this.#name));
    if (graph.store.countQuads(node, null, null, null) > 0) {
      throw new Error(`"${this.#name}" is already in this graph (<${node.value}>)`);
    }
    this.#graph = graph;
    this.#node = node;
    try {
      for (const write of this.#pending) write();
    } catch (error) {
      graph.store.removeQuads(graph.store.getQuads(node, null, null, null));
      this.#graph = undefined;
      this.#node = undefined;
      throw error;
    }
    remember(graph.store, node.value);
    this.#pending = [];
    LOOSE.delete(this);
  }

  #notYet(what: string): Error {
    return new Error(`"${this.#name}" is not in a graph yet, so it has no ${what}: graph.add() it first`);
  }

  #is(object: Quad["object"], value: string): boolean {
    if (object.termType === "Literal") return object.value === value;
    try {
      return object.value === this.graph.iri(value);
    } catch {
      return false;
    }
  }
}
