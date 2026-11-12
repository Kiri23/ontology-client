// edit.ts — what you write on a resource: the editors that `vocabulary.add()`, `vocabulary.edit()` and
// `vocabulary.scheme(id)` hand out. Every method writes one thing and returns the editor, so they chain.
//
// Reading lives in terms.ts and writing here, so `label()` never means two things on the same object.
//
// To add a setter, follow the ones here: a method named after the SKOS property, in the singular, that calls `set`
// (one value per language) or `add` (as many as you write).

// @ts-types="@types/n3"
import { DataFactory, type Quad } from "n3";
import type { Vocabulary } from "../vocabulary.ts";
import { localName, RDFS, SKOS } from "./names.ts";
import type { SubjectNode } from "./terms.ts";

const { namedNode, literal, quad } = DataFactory;

/**
 * Writes on any resource: the concept scheme, or a resource of a type of your own.
 *
 * ```ts
 * vocab.scheme("vocabulary").label("Demo").definition("The terms of the demo.");
 * ```
 */
export class ResourceEditor {
  /** The vocabulary being edited. */
  readonly vocabulary: Vocabulary;
  /** The n3 node being written on. */
  readonly node: SubjectNode;

  /** Use `vocabulary.add()`, `vocabulary.edit()` or `vocabulary.scheme(id)` instead of building one. */
  constructor(vocabulary: Vocabulary, node: SubjectNode) {
    this.vocabulary = vocabulary;
    this.node = node;
  }

  /** The whole IRI of what is being edited. */
  get iri(): string {
    return this.node.value;
  }

  /** Its local name. */
  get id(): string {
    return localName(this.node.value);
  }

  /**
   * Sets the `skos:prefLabel`. It replaces the one in the same language and leaves the others. Without a language,
   * the text goes in the one set with `vocabulary.language()`.
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
    return this.add(predicate, namedNode(this.vocabulary.iri(target)));
  }

  /**
   * Takes back what was written for a predicate: one value (a text, or the name of a resource), or all of them when
   * you pass none.
   */
  unset(predicate: string, value?: string): this {
    const { store } = this.vocabulary;
    const written = store.getQuads(this.node, namedNode(this.vocabulary.iri(predicate)), null, null);
    const gone = value === undefined ? written : written.filter((q) => this.#is(q.object, value));
    store.removeQuads(gone);
    return this;
  }

  /** For the setters of one value per language: writes the text and drops the one that was in that language. */
  protected set(predicate: string, text: string, language?: string): this {
    const tag = (language ?? this.vocabulary.defaultLanguage).toLowerCase();
    const { store } = this.vocabulary;
    const before = store.getQuads(this.node, namedNode(this.vocabulary.iri(predicate)), null, null);
    store.removeQuads(before.filter((q) => q.object.termType === "Literal" && q.object.language === tag));
    return this.add(predicate, literal(text, tag || undefined));
  }

  /** For the setters of many values: writes one more statement. */
  protected add(predicate: string, object: Quad["object"]): this {
    this.vocabulary.store.addQuad(quad(this.node, namedNode(this.vocabulary.iri(predicate)), object));
    return this;
  }

  /** For the setters that write a text in the language of the vocabulary. */
  protected text(text: string, language?: string): Quad["object"] {
    return literal(text, (language ?? this.vocabulary.defaultLanguage).toLowerCase() || undefined);
  }

  #is(object: Quad["object"], value: string): boolean {
    if (object.termType === "Literal") return object.value === value;
    try {
      return object.value === this.vocabulary.iri(value);
    } catch {
      return false;
    }
  }
}

/**
 * Writes on a term.
 *
 * ```ts
 * vocab.add("harness").label("Harness").definition("…").broader("provider");
 * vocab.edit("harness").altLabel("Arnés", "es");
 * ```
 */
export class TermEditor extends ResourceEditor {
  /** Adds a `skos:altLabel`: another name people use for the term. */
  altLabel(text: string, language?: string): this {
    return this.add(`${SKOS}altLabel`, this.text(text, language));
  }

  /** Adds a `skos:example`. */
  example(text: string, language?: string): this {
    return this.add(`${SKOS}example`, this.text(text, language));
  }

  /** Says a term is more general than this one (`skos:broader`). The other side, narrower, is worked out. */
  broader(term: string): this {
    return this.link(`${SKOS}broader`, term);
  }

  /** Says a term is related to this one (`skos:related`). Writing it on one of the two is enough. */
  related(term: string): this {
    return this.link(`${SKOS}related`, term);
  }

  /** Puts the term in a concept scheme (`skos:inScheme`). `vocabulary.add()` already does it when there is one. */
  inScheme(scheme: string): this {
    return this.link(`${SKOS}inScheme`, scheme);
  }
}
