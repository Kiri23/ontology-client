// edit.ts — what you write on a term: the editor that `vocabulary.add()` and `vocabulary.edit()` hand out. It is a
// ResourceEditor (graph/editor.ts) that also knows the SKOS of a term. Every method writes one thing and returns the
// editor, so they chain.
//
// Reading lives in terms.ts and writing here, so `label()` never means two things on the same object.
//
// To add a setter, follow the ones here: a method named after the SKOS property, in the singular, that calls `set`
// (one value per language), `add` or `addText` (as many as you write).

import type { Vocabulary } from "../vocabulary.ts";
import { ResourceEditor } from "../graph/editor.ts";
import { SKOS } from "../graph/names.ts";

/**
 * Writes on a term.
 *
 * ```ts
 * vocab.add("harness").label("Harness").definition("…").broader("provider");
 * vocab.edit("harness").altLabel("Arnés", "es");
 * ```
 */
export class TermEditor extends ResourceEditor {
  /** The vocabulary being edited: the same as `graph`. */
  get vocabulary(): Vocabulary {
    return this.graph as Vocabulary;
  }

  /** Adds a `skos:altLabel`: another name people use for the term. */
  altLabel(text: string, language?: string): this {
    return this.addText(`${SKOS}altLabel`, text, language);
  }

  /** Adds a `skos:example`. */
  example(text: string, language?: string): this {
    return this.addText(`${SKOS}example`, text, language);
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
