// terms.ts — what you read from a vocabulary besides what any Resource answers (graph/resource.ts): a Term (a
// skos:Concept) and Terms (a list of terms you keep chaining on).
//
// vocabulary.ts hands these out; they read the graph every time, so they never go stale after an edit.
//
// To add a getter, follow the ones here: a method named after the SKOS property, that returns what is written and
// nothing else. The library never translates or tidies a label or a definition.

// @ts-types="@types/n3"
import { DataFactory, type NamedNode, type Quad } from "n3";
import type { Vocabulary } from "../vocabulary.ts";
import { RDF_TYPE, SKOS } from "../graph/names.ts";
import { inOrder } from "../graph/order.ts";
import { Resource } from "../graph/resource.ts";

const { namedNode } = DataFactory;

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
  /** The vocabulary the term was read from. */
  declare readonly graph: Vocabulary;

  /** Use `vocabulary.term()` or `vocabulary.terms()` instead of building one. */
  constructor(vocabulary: Vocabulary, node: NamedNode) {
    super(vocabulary, node);
  }

  /** The vocabulary the term was read from: the same as `graph`. */
  get vocabulary(): Vocabulary {
    return this.graph;
  }

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
