// resource.ts — what you read about one resource of a graph: a Resource answers what is written about it, by
// predicate. Graph and Vocabulary hand them out; Term (vocabulary/terms.ts) is a Resource that also knows SKOS.
//
// A Resource reads the graph every time, so it never goes stale after an edit.
//
// To add a getter, follow the ones here: a method named after the property, that returns what is written and nothing
// else. The library never translates or tidies a label or a definition.

// @ts-types="@types/n3"
import { type BlankNode, DataFactory, type NamedNode, type Quad, type Store } from "n3";
import { localName, RDF_TYPE, RDFS, SKOS } from "./names.ts";
import { inOrder } from "./order.ts";

const { namedNode } = DataFactory;

/**
 * Where a resource lives: a `Graph` or a `Vocabulary`. Its statements, and how a name written in code becomes
 * an IRI.
 */
export interface Source {
  /** The n3 `Store` with every statement. */
  readonly store: Store;
  /** The language new labels are written in; `""` when none was set. */
  readonly defaultLanguage: string;
  /** The IRI of a name: bare, by prefix or whole. */
  iri(name: string): string;
  /** The IRI of a predicate or a type: by prefix or whole, never bare. */
  predicate(name: string): string;
}

/** A text as it is written in the Turtle, with its language. */
export interface Literal {
  /** The text, untouched. */
  value: string;
  /** The language tag, in lowercase (`"en"`, `"es-mx"`); `""` when the text has none. */
  language: string;
}

/** The node of a subject: an IRI or a blank node. */
export type SubjectNode = NamedNode | BlankNode;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Anything a graph describes: a term, a concept scheme, or a resource of a type of your own (a page, a script…). It
 * answers what is written about it, by predicate.
 *
 * ```ts
 * const page = graph.instancesOf("doc:Page")[0];
 * page.values("doc:path"); // ["tutorial/getting-started.md"]
 * ```
 */
export class Resource {
  /** Where it was read from: a Graph or a Vocabulary. */
  readonly graph: Source;
  /** The n3 node, for when you go down to `graph.store`. */
  readonly node: SubjectNode;

  /** Use `graph.instancesOf()`, `graph.resource()` or `vocabulary.term()` instead of building one. */
  constructor(graph: Source, node: SubjectNode) {
    this.graph = graph;
    this.node = node;
  }

  /** The whole IRI. For a blank node, the label n3 gave it. */
  get iri(): string {
    return this.node.value;
  }

  /** The local name: what follows the last `#` or `/` of the IRI. */
  get id(): string {
    return localName(this.node.value);
  }

  /** Whether it is a blank node: something without an IRI of its own. */
  get blank(): boolean {
    return this.node.termType === "BlankNode";
  }

  /** The IRIs of its types (`a …`). */
  types(): string[] {
    return this.values(RDF_TYPE);
  }

  /**
   * Every value written for a predicate: the IRI of each resource and the text of each literal.
   *
   * The predicate goes by prefix (`"doc:symbol"`, with the prefix the Turtle declares) or as a whole IRI. This is
   * how you read a predicate of your own repo.
   */
  values(predicate: string): string[] {
    return this.#objects(predicate).map((o) => o.value);
  }

  /** The texts written for a predicate, each with its language. Leaves out what is not a literal. */
  literals(predicate: string): Literal[] {
    return this.#objects(predicate).flatMap((o) =>
      o.termType === "Literal" ? [{ value: o.value, language: o.language }] : []
    );
  }

  /**
   * The `skos:prefLabel` as it is written. With a language, the one in that language; without, the first one
   * written. `undefined` when there is none: the library does not make one up.
   */
  label(language?: string): string | undefined {
    return this.#texts(`${SKOS}prefLabel`, language)[0];
  }

  /** The `skos:altLabel`s; with a language, only the ones in it. */
  altLabels(language?: string): string[] {
    return this.#texts(`${SKOS}altLabel`, language);
  }

  /** The `skos:definition` as it is written; same choice of language as `label()`. */
  definition(language?: string): string | undefined {
    return this.#texts(`${SKOS}definition`, language)[0];
  }

  /** The `skos:example`s; with a language, only the ones in it. */
  examples(language?: string): string[] {
    return this.#texts(`${SKOS}example`, language);
  }

  /** The `rdfs:seeAlso` links. */
  seeAlso(): string[] {
    return this.values(`${RDFS}seeAlso`);
  }

  /**
   * The resources that point here with a predicate: `term.referencedBy("dct:references")` are the pages that use the
   * term. It is `values()` read from the other end.
   */
  referencedBy(predicate: string): Resource[] {
    const { store } = this.graph;
    const subjects = store.getSubjects(namedNode(this.graph.predicate(predicate)), this.node, null);
    return inOrder(store, subjects as SubjectNode[]).map((s) => new Resource(this.graph, s));
  }

  /** Every statement that has this resource as subject, as n3 quads. */
  quads(): Quad[] {
    return this.graph.store.getQuads(this.node, null, null, null);
  }

  #objects(predicate: string): Quad["object"][] {
    return this.graph.store.getObjects(this.node, namedNode(this.graph.predicate(predicate)), null);
  }

  #texts(predicate: string, language?: string): string[] {
    const written = this.literals(predicate);
    return (language === undefined ? written : written.filter((l) => same(l.language, language))).map((l) => l.value);
  }
}

/** Every resource of a type, in the order they were written. Graph and Vocabulary answer `instancesOf()` with it. */
export function instancesOf(graph: Source, type: string): Resource[] {
  const subjects = graph.store.getSubjects(namedNode(RDF_TYPE), namedNode(graph.predicate(type)), null);
  return inOrder(graph.store, subjects as SubjectNode[]).map((node) => new Resource(graph, node));
}
