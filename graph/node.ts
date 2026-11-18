// node.ts — a node of a graph before it is in one: what you want written about a resource, kept until `graph.add()`
// takes it. A type of your own repo (a script, a page) is a subclass of GraphNode, in your repo.
//
// A node holds no graph and nothing outside holds a node: `graph.add()` (graph.ts) asks it to write itself with a
// ResourceEditor (vocabulary/edit.ts), and only there its name and its predicates become IRIs.
//
// To add a setter, follow the ones here: a method that calls `write` with the method of the editor that does it.

import type { ResourceEditor } from "../vocabulary/edit.ts";
import { RDF_TYPE } from "../vocabulary/names.ts";
import type { Source } from "../vocabulary/terms.ts";

/** The editor a node writes itself with: the one of the graph that takes it. */
type Editor = ResourceEditor<Source>;

/**
 * A node to put in a graph: a resource of any type, created on its own and then added.
 *
 * ```ts
 * const graph = Graph.create("https://example.com/doc#").prefix("doc", "https://example.com/doc#");
 * graph.add(GraphNode.create("intro").a("doc:Page").value("doc:path", "tutorial/intro.md"));
 *
 * // A type of your own repo is a subclass: its create gives the type, its methods name its predicates.
 * class Page extends GraphNode {
 *   static override create(id: string): Page {
 *     return new Page(id).a("doc:Page");
 *   }
 *   path(p: string): this {
 *     return this.value("doc:path", p);
 *   }
 * }
 * graph.add(Page.create("guide").path("guide.md").label("Guide"));
 * ```
 *
 * **A node that is never given to `graph.add()` is not in any file, and nothing says so**: it is a value like any
 * other, so create it inside the `add()`.
 */
export class GraphNode {
  /** The name it was created with: bare (`"intro"`), by prefix or a whole IRI. The graph that takes it makes the IRI. */
  readonly id: string;
  #writes: ((editor: Editor) => void)[] = [];
  #added = false;

  /** Use `create()` instead; a subclass calls it from its own `create`. */
  constructor(id: string) {
    this.id = id;
  }

  /**
   * A node on its own, to fill and then give to `graph.add()`.
   *
   * A subclass writes its own `create` that calls `new` and gives its type: `new Page(id).a("doc:Page")`.
   */
  static create(id: string): GraphNode {
    return new GraphNode(id);
  }

  /** Adds a type (`a doc:Page`), by prefix or whole IRI. Throws on a bare name: it is not a type. */
  a(type: string): this {
    if (!type.includes(":")) {
      throw new Error(`"${type}" is not a type: write it with its prefix ("doc:${type}") or as a whole IRI`);
    }
    return this.link(RDF_TYPE, type);
  }

  /** Sets the `skos:prefLabel`. Without a language, the text goes in the one set with `graph.language()`. */
  label(text: string, language?: string): this {
    return this.write((editor) => editor.label(text, language));
  }

  /** Sets the `skos:definition`; same choice of language as `label()`. */
  definition(text: string, language?: string): this {
    return this.write((editor) => editor.definition(text, language));
  }

  /** Adds an `rdfs:seeAlso` link. */
  seeAlso(url: string): this {
    return this.write((editor) => editor.seeAlso(url));
  }

  /** Adds a text for any predicate, by prefix or whole IRI. This is how you write a predicate of your own repo. */
  value(predicate: string, text: string, language?: string): this {
    return this.write((editor) => editor.value(predicate, text, language));
  }

  /** Adds a link to another resource for any predicate. The target goes by local name, by prefix or as an IRI. */
  link(predicate: string, target: string): this {
    return this.write((editor) => editor.link(predicate, target));
  }

  /**
   * Keeps one thing to write when a graph takes the node. Throws once a graph took it: what is written afterwards
   * would not reach that graph.
   */
  protected write(write: (editor: Editor) => void): this {
    if (this.#added) {
      throw new Error(`"${this.id}" is already in a graph: write on it before graph.add(), or on graph.store`);
    }
    this.#writes.push(write);
    return this;
  }

  /** Writes what the node kept, with the editor of the graph that takes it. Only `graph.add()` calls it. */
  writeWith(editor: Editor): void {
    for (const write of this.#writes) write(editor);
    this.#added = true;
  }
}
