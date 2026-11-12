// terms.ts — what you read from a vocabulary: a Resource (anything with an IRI), a Term (a skos:Concept) and Terms
// (a list of terms you keep chaining on).
//
// vocabulary.ts hands these out; they read the graph every time, so they never go stale after an edit.
//
// To add a getter, follow the ones here: a method named after the SKOS property, that returns what is written and
// nothing else. The library never translates or tidies a label or a definition.

// @ts-types="@types/n3"
import { type BlankNode, DataFactory, type NamedNode, type Quad } from "n3";
import type { Vocabulary } from "../vocabulary.ts";
import { localName, RDF_TYPE, RDFS, SKOS } from "./names.ts";
import { inOrder } from "./order.ts";

const { namedNode } = DataFactory;

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
 * Anything the vocabulary describes: a term, the concept scheme, or a resource of a type of your own (a page, a
 * person…). It answers what is written about it, by predicate.
 *
 * ```ts
 * const page = vocab.instancesOf("doc:Page")[0];
 * page.values("doc:path"); // ["tutorial/getting-started.md"]
 * ```
 */
export class Resource {
  /** The vocabulary this resource was read from. */
  readonly vocabulary: Vocabulary;
  /** The n3 node, for when you go down to `vocabulary.store`. */
  readonly node: SubjectNode;

  /** Use `vocabulary.term()`, `vocabulary.resource()` or `vocabulary.instancesOf()` instead of building one. */
  constructor(vocabulary: Vocabulary, node: SubjectNode) {
    this.vocabulary = vocabulary;
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
    const { store } = this.vocabulary;
    const subjects = store.getSubjects(namedNode(this.vocabulary.predicate(predicate)), this.node, null);
    return inOrder(store, subjects as SubjectNode[]).map((s) => new Resource(this.vocabulary, s));
  }

  /** Every statement that has this resource as subject, as n3 quads. */
  quads(): Quad[] {
    return this.vocabulary.store.getQuads(this.node, null, null, null);
  }

  #objects(predicate: string): Quad["object"][] {
    return this.vocabulary.store.getObjects(this.node, namedNode(this.vocabulary.predicate(predicate)), null);
  }

  #texts(predicate: string, language?: string): string[] {
    const written = this.literals(predicate);
    return (language === undefined ? written : written.filter((l) => same(l.language, language))).map((l) => l.value);
  }
}

/** Whether a node is a term: an IRI that is `a skos:Concept` and is not the concept scheme itself. */
export function isTerm(vocabulary: Vocabulary, node: { termType: string; value: string }): node is NamedNode {
  if (node.termType !== "NamedNode") return false;
  const { store } = vocabulary;
  const is = (type: string) => store.countQuads(node as NamedNode, namedNode(RDF_TYPE), namedNode(type), null) > 0;
  return is(`${SKOS}Concept`) && !is(`${SKOS}ConceptScheme`);
}

/**
 * A term of the vocabulary: a `skos:Concept` with an IRI. Besides what every Resource answers, it knows its place in
 * the hierarchy.
 *
 * ```ts
 * vocab.term("provider").narrower().ids(); // ["harness", "endpoint"]
 * ```
 *
 * The relations only return terms of this same vocabulary. A `skos:broader` that points to another vocabulary is
 * still there as an IRI: `term.values("skos:broader")`.
 */
export class Term extends Resource {
  /** The terms one step more general: its `skos:broader`, and whoever names it as `skos:narrower`. */
  broader(): Terms {
    return this.#terms([...this.#written("broader"), ...this.#inverse("narrower")]);
  }

  /** The terms one step more specific: whoever names it as `skos:broader`, and its `skos:narrower`. */
  narrower(): Terms {
    return this.#terms([...this.#inverse("broader"), ...this.#written("narrower")]);
  }

  /** The `skos:related` terms, whichever of the two wrote it: SKOS reads it both ways. */
  related(): Terms {
    return this.#terms([...this.#written("related"), ...this.#inverse("related")]);
  }

  /** Every term above this one, however many steps up, never itself. A cycle does not hang it. */
  ancestors(): Terms {
    return this.#climb((t) => t.broader());
  }

  /** Every term below this one, however many steps down, never itself. A cycle does not hang it. */
  descendants(): Terms {
    return this.#climb((t) => t.narrower());
  }

  #written(property: string): Quad["object"][] {
    return this.vocabulary.store.getObjects(this.node, namedNode(SKOS + property), null);
  }

  #inverse(property: string): Quad["subject"][] {
    return this.vocabulary.store.getSubjects(namedNode(SKOS + property), this.node, null);
  }

  #terms(nodes: { termType: string; value: string }[]): Terms {
    const unique = new Map(nodes.filter((n) => isTerm(this.vocabulary, n)).map((n) => [n.value, n as NamedNode]));
    const ordered = inOrder(this.vocabulary.store, [...unique.values()]);
    return new Terms(this.vocabulary, ordered.map((n) => new Term(this.vocabulary, n)));
  }

  #climb(step: (t: Term) => Terms): Terms {
    const seen = new Map<string, NamedNode>();
    const pending = step(this).toArray();
    while (pending.length) {
      const next = pending.shift()!;
      if (seen.has(next.iri)) continue;
      seen.set(next.iri, next.node as NamedNode);
      pending.push(...step(next));
    }
    // In a cycle the walk comes back to where it started: a term is not its own ancestor.
    seen.delete(this.iri);
    return this.#terms([...seen.values()]);
  }
}

/**
 * A list of terms that keeps chaining: filter it, then ask for ids, IRIs or the terms themselves.
 *
 * ```ts
 * vocab.terms().where("doc:symbol").missing().ids(); // the terms no symbol is anchored to
 * for (const term of vocab.terms()) console.log(term.label());
 * ```
 */
export class Terms implements Iterable<Term> {
  readonly #vocabulary: Vocabulary;
  readonly #items: Term[];

  /** Use `vocabulary.terms()` or a relation of a Term instead of building one. */
  constructor(vocabulary: Vocabulary, items: Term[]) {
    this.#vocabulary = vocabulary;
    this.#items = items;
  }

  /** How many terms there are. */
  get size(): number {
    return this.#items.length;
  }

  /** The local name of each term. */
  ids(): string[] {
    return this.#items.map((t) => t.id);
  }

  /** The IRI of each term. */
  iris(): string[] {
    return this.#items.map((t) => t.iri);
  }

  /** The terms as a plain array. */
  toArray(): Term[] {
    return [...this.#items];
  }

  /** What `fn` gives for each term. */
  map<T>(fn: (term: Term) => T): T[] {
    return this.#items.map(fn);
  }

  /** The terms `keep` says yes to, still as a list you can chain on. */
  filter(keep: (term: Term) => boolean): Terms {
    return new Terms(this.#vocabulary, this.#items.filter(keep));
  }

  /**
   * Starts a filter by predicate; finish it with `.exists()`, `.missing()` or `.is(value)`.
   *
   * ```ts
   * vocab.terms().where("skos:broader").missing(); // the terms at the top
   * vocab.terms().where("doc:symbol").is("@scope/pkg#Bench.provider");
   * ```
   */
  where(predicate: string): Where {
    // Resolved here so a mistyped prefix fails even when the list is empty.
    this.#vocabulary.predicate(predicate);
    return new Where(this, predicate);
  }

  /** Walks the terms in order, so `for … of` and `[...terms]` work. */
  [Symbol.iterator](): Iterator<Term> {
    return this.#items[Symbol.iterator]();
  }
}

/** The second half of `terms.where(predicate)`: which terms to keep. */
export class Where {
  readonly #terms: Terms;
  readonly #predicate: string;

  /** Use `terms.where(predicate)` instead of building one. */
  constructor(terms: Terms, predicate: string) {
    this.#terms = terms;
    this.#predicate = predicate;
  }

  /** The terms that have at least one value for the predicate. */
  exists(): Terms {
    return this.#terms.filter((t) => t.values(this.#predicate).length > 0);
  }

  /** The terms that have no value for the predicate. */
  missing(): Terms {
    return this.#terms.filter((t) => t.values(this.#predicate).length === 0);
  }

  /** The terms that have exactly this value (a text, or the IRI of a resource) for the predicate. */
  is(value: string): Terms {
    return this.#terms.filter((t) => t.values(this.#predicate).includes(value));
  }
}
