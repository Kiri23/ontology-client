// check.ts — the rules a vocabulary has to follow. `vocabulary.check()` starts one; each method asks for one more
// rule, and `problems()` gives what is broken.
//
// What makes it SKOS at all is always checked. What each repo decides (its language, its namespace, one scheme, web
// links) is one method each: a repo asks for exactly the rules it wants.
//
// Every problem carries a `rule`: a short name that does not change, so a repo can count them, skip one or write its
// own message for it. The English `message` is ready to print as it is.
//
// To add a rule: add its name to `Rule`, write the function that finds it next to the others, and, if not every
// vocabulary wants it, a method on `Check` that turns it on.

// @ts-types="@types/n3"
import { DataFactory, type Quad } from "n3";
import type { Vocabulary } from "../vocabulary.ts";
import { localName, namespaceOf, RDF_TYPE, RDFS, SKOS } from "./names.ts";
import { inOrder } from "./order.ts";
import { isTerm, type Literal, Resource, type SubjectNode } from "./terms.ts";

const { namedNode } = DataFactory;

/** A local name that also works as a file name: lowercase letters, digits and single hyphens. */
const LOCAL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The name of each rule. They are stable: code may switch on them. */
export type Rule =
  /** Always: there is no `skos:Concept` at all. */
  | "no-concepts"
  /** Always: something has a label or a definition but is not `a skos:Concept`. */
  | "not-a-concept"
  /** Always: a term is a blank node, without an IRI. */
  | "blank-node"
  /**
   * Always: `skos:broader`, `skos:narrower` or `skos:related` points to something that is not a term. A
   * `skos:broader` to the namespace of a vocabulary that was not given is not checked.
   */
  | "missing-target"
  /** Always: `skos:related` points to the term itself. */
  | "related-self"
  /** Always: two terms are joined both by `skos:related` and by the hierarchy. SKOS keeps them apart. */
  | "related-broader-overlap"
  /** Always: following `skos:broader` comes back to where it started. */
  | "broader-cycle"
  /** `.language()`: a label or a definition is in another language, or in none. */
  | "language"
  /** `.language()`: there is not exactly one label, or one definition, in the language. */
  | "cardinality"
  /** `.language()`: the label or the definition is blank. */
  | "empty"
  /** `.namespace()`: the IRI of a term is outside the namespace. */
  | "namespace"
  /** `.namespace()`: the local name does not work as a file name. */
  | "local-name"
  /** `.oneScheme()`: the file does not declare exactly one `skos:ConceptScheme`. */
  | "scheme-count"
  /** `.oneScheme()`: a term is not `skos:inScheme` of that scheme, and only of it. */
  | "in-scheme"
  /** `.seeAlsoUrls()`: an `rdfs:seeAlso` is a text or a blank node, not a link. */
  | "see-also-not-iri"
  /** `.seeAlsoUrls()`: an `rdfs:seeAlso` is not an http(s) address. */
  | "see-also-not-http";

/** One broken rule. Beyond `term`, `rule` and `message`, the other fields carry what the message talks about. */
export interface Problem {
  /** The IRI of the term (the label n3 gave it, for a blank node); `""` when the problem is of the whole file. */
  term: string;
  /** Which rule is broken. */
  rule: Rule;
  /** The problem in English, ready to print. */
  message: string;
  /** The predicate involved, as `skos:prefLabel`. */
  property?: string;
  /** The value that is wrong: a text, or the IRI something points to. */
  value?: string;
  /** Several values: the terms of a cycle in order, or the schemes found. */
  values?: string[];
  /** What was found instead: the language of a text (`""` for none), or the kind of node. */
  found?: string;
  /** What the rule asked for: the language, the namespace or the scheme. */
  expected?: string;
  /** How many were found, when the rule counts. */
  count?: number;
}

/** What `problems()` needs to know about one term while it checks the others. */
interface Node {
  iri: string;
  broader: string[];
}

/**
 * The rules to check, built one method at a time.
 *
 * ```ts
 * const problems = vocab.check()
 *   .language("en")
 *   .namespace("https://example.com/vocabulary#")
 *   .oneScheme()
 *   .problems();
 * for (const p of problems) console.error(p.message);
 * ```
 *
 * Checked always, with no method: there is at least one `skos:Concept`; whatever has a label or a definition is one;
 * a term has an IRI; `skos:broader`, `skos:narrower` and `skos:related` point to a term that exists; `related` does
 * not point to itself nor join two terms the hierarchy already joins; `broader` has no cycles.
 *
 * A `skos:broader` may also point to a vocabulary that was not given: to an IRI in a namespace that no term of this
 * vocabulary or of `.context()` uses, and that is not the one given to `.namespace()`. It is trusted, not looked up.
 * A `skos:broader` to a missing IRI in one of those namespaces is still a problem: that is how a typo shows up.
 */
export class Check {
  readonly #vocabulary: Vocabulary;
  readonly #context: Vocabulary[] = [];
  #language?: string;
  #namespace?: string;
  #oneScheme = false;
  #seeAlsoUrls = false;

  /** Use `vocabulary.check()` instead of building one. */
  constructor(vocabulary: Vocabulary) {
    this.#vocabulary = vocabulary;
  }

  /**
   * Every term has exactly one `skos:prefLabel` and one `skos:definition` in this language, neither blank, and none
   * in another language or without one.
   */
  language(tag: string): this {
    this.#language = tag.toLowerCase();
    return this;
  }

  /**
   * Every term lives in this namespace, and its local name works as a file name: lowercase letters, digits and
   * hyphens, and not `readme`.
   */
  namespace(iri: string): this {
    this.#namespace = iri;
    return this;
  }

  /** The file declares exactly one `skos:ConceptScheme`, and every term is `skos:inScheme` of it and only of it. */
  oneScheme(): this {
    this.#oneScheme = true;
    return this;
  }

  /** Every `rdfs:seeAlso` of a term is a link to an http(s) address. */
  seeAlsoUrls(): this {
    this.#seeAlsoUrls = true;
    return this;
  }

  /**
   * The terms of other vocabularies count as existing: `skos:broader`, `skos:narrower` and `skos:related` may point
   * to them. Their own rules are not checked here. Call it once per vocabulary, or pass several.
   */
  context(...vocabularies: Vocabulary[]): this {
    this.#context.push(...vocabularies);
    return this;
  }

  /** Whether nothing is broken. */
  passes(): boolean {
    return this.problems().length === 0;
  }

  /**
   * What is broken, in the order of the file: first the problems of the whole file, then each term's, then the
   * cycles. Empty when the vocabulary follows every rule asked for.
   */
  problems(): Problem[] {
    const vocabulary = this.#vocabulary;
    const candidates = candidatesOf(vocabulary);
    const found: Problem[] = [];

    const anyConcept = candidates.some((c) => c.types().includes(`${SKOS}Concept`));
    if (!anyConcept) found.push({ term: "", rule: "no-concepts", message: "the vocabulary has no skos:Concept" });
    const schemes = vocabulary.schemes().filter((s) => !s.blank).map((s) => s.iri);
    if (this.#oneScheme && schemes.length !== 1) {
      found.push({
        term: "",
        rule: "scheme-count",
        message: `the vocabulary declares ${schemes.length} skos:ConceptScheme; it must be one`,
        count: schemes.length,
        values: schemes,
      });
    }
    if (!anyConcept) return found;

    // The context goes first: when an IRI is in both, the vocabulary's own term is the one that counts.
    const known = new Map<string, Node>();
    for (const v of [...this.#context, vocabulary]) {
      for (const t of v.terms()) known.set(t.iri, { iri: t.iri, broader: hierarchy(t) });
    }

    // The namespaces whose terms we can look up: this vocabulary's and the context's. A broader outside all of them
    // goes to a vocabulary nobody gave us, so it is trusted.
    const checked = new Set([...this.#context, vocabulary].flatMap((v) => v.terms().map((t) => namespaceOf(t.iri))));
    if (this.#namespace !== undefined) checked.add(this.#namespace);

    for (const c of candidates) {
      if (c.blank) {
        found.push({
          term: c.iri,
          rule: "blank-node",
          message: `blank node "${c.label() ?? c.iri}": a term needs an IRI`,
          value: c.label() ?? c.iri,
          expected: this.#namespace,
        });
        continue;
      }
      if (!isTerm(vocabulary, c.node)) {
        found.push({
          term: c.iri,
          rule: "not-a-concept",
          message: `${c.id}: has a label or a definition but is not \`a skos:Concept\``,
        });
        continue;
      }
      if (this.#namespace !== undefined) found.push(...inNamespace(c, this.#namespace));
      if (this.#oneScheme && schemes.length === 1) found.push(...inScheme(c, schemes[0]));
      if (this.#language !== undefined) {
        found.push(...oneText(c, "prefLabel", this.#language), ...oneText(c, "definition", this.#language));
      }
      found.push(...relations(c, known, checked));
      if (this.#seeAlsoUrls) found.push(...seeAlso(c));
    }
    // A cycle that only goes through terms of the context is the other vocabulary's problem.
    const own = new Set(vocabulary.terms().iris());
    return [...found, ...cycles(known).filter((p) => p.values!.some((iri) => own.has(iri)))];
  }
}

/** Whatever looks like a term: it is `a skos:Concept`, or has a label or a definition. The scheme is not one. */
function candidatesOf(vocabulary: Vocabulary): Resource[] {
  const { store } = vocabulary;
  const nodes = new Map<string, SubjectNode>();
  const note = (subjects: Quad["subject"][]) => {
    for (const s of subjects) nodes.set(`${s.termType} ${s.value}`, s as SubjectNode);
  };
  note(store.getSubjects(namedNode(RDF_TYPE), namedNode(`${SKOS}Concept`), null));
  note(store.getSubjects(namedNode(`${SKOS}prefLabel`), null, null));
  note(store.getSubjects(namedNode(`${SKOS}definition`), null, null));
  const schemes = new Set(vocabulary.schemes().map((s) => `${s.node.termType} ${s.iri}`));
  const candidates = [...nodes].filter(([key]) => !schemes.has(key)).map(([, node]) => node);
  return inOrder(store, candidates).map((node) => new Resource(vocabulary, node));
}

/** The IRIs one step above a term: its `skos:broader`, and whoever names it as `skos:narrower`. */
function hierarchy(term: Resource): string[] {
  const { store } = term.vocabulary;
  const named = store.getSubjects(namedNode(`${SKOS}narrower`), term.node, null).map((s) => s.value);
  return [...new Set([...term.values(`${SKOS}broader`), ...named])];
}

function inNamespace(c: Resource, namespace: string): Problem[] {
  if (c.iri !== namespace + c.id) {
    return [{
      term: c.iri,
      rule: "namespace",
      message: `${c.iri}: a term must be in the namespace ${namespace}`,
      expected: namespace,
    }];
  }
  if (LOCAL_NAME.test(c.id) && c.id !== "readme") return [];
  return [{
    term: c.iri,
    rule: "local-name",
    message: `${c.iri}: the local name "${c.id}" must be lowercase letters, digits and hyphens, and not "readme"`,
    value: c.id,
  }];
}

function inScheme(c: Resource, scheme: string): Problem[] {
  const written = c.values(`${SKOS}inScheme`);
  if (written.length === 1 && written[0] === scheme) return [];
  return [{
    term: c.iri,
    rule: "in-scheme",
    message: `${c.id}: must be skos:inScheme of <${scheme}>, and only of it`,
    property: "skos:inScheme",
    values: written,
    count: written.length,
    expected: scheme,
  }];
}

function oneText(c: Resource, name: "prefLabel" | "definition", language: string): Problem[] {
  const property = `skos:${name}`;
  const written: Literal[] = c.literals(SKOS + name);
  const found: Problem[] = written.filter((l) => l.language !== language).map((l) => ({
    term: c.iri,
    rule: "language",
    message: `${c.id}: ${property} "${l.value}" ${
      l.language ? `is tagged @${l.language}` : "has no language tag"
    }; it must be @${language}`,
    property,
    value: l.value,
    found: l.language,
    expected: language,
  }));
  const ours = written.filter((l) => l.language === language);
  if (ours.length !== 1) {
    found.push({
      term: c.iri,
      rule: "cardinality",
      message: `${c.id}: has ${ours.length} ${property} in @${language}; it must have exactly one`,
      property,
      count: ours.length,
      expected: language,
    });
  }
  if (ours.some((l) => l.value.trim() === "")) {
    found.push({ term: c.iri, rule: "empty", message: `${c.id}: ${property} is empty`, property });
  }
  return found;
}

/** Every IRI above `iri`, however many steps up; a cycle does not hang it. */
function ancestors(iri: string, known: Map<string, Node>): Set<string> {
  const seen = new Set<string>();
  const pending = [...(known.get(iri)?.broader ?? [])];
  while (pending.length) {
    const a = pending.pop()!;
    if (seen.has(a) || !known.has(a)) continue;
    seen.add(a);
    pending.push(...known.get(a)!.broader);
  }
  return seen;
}

function relations(c: Resource, known: Map<string, Node>, checked: Set<string>): Problem[] {
  const found: Problem[] = [];
  for (const name of ["broader", "narrower", "related"]) {
    for (const target of c.values(SKOS + name)) {
      if (known.has(target)) continue;
      if (name === "broader" && !checked.has(namespaceOf(target))) continue;
      found.push({
        term: c.iri,
        rule: "missing-target",
        message: `${c.id}: skos:${name} points to ${target}, which is not a term`,
        property: `skos:${name}`,
        value: target,
      });
    }
  }
  for (const r of c.values(`${SKOS}related`)) {
    if (r === c.iri) {
      found.push({ term: c.iri, rule: "related-self", message: `${c.id}: skos:related points to itself` });
    } else if (known.has(r) && (ancestors(c.iri, known).has(r) || ancestors(r, known).has(c.iri))) {
      found.push({
        term: c.iri,
        rule: "related-broader-overlap",
        message: `${c.id}: skos:related and skos:broader both join ${c.id} and ${localName(r)}; ` +
          "SKOS keeps them disjoint",
        value: r,
      });
    }
  }
  return found;
}

function seeAlso(c: Resource): Problem[] {
  const found: Problem[] = [];
  for (const o of c.vocabulary.store.getObjects(c.node, namedNode(`${RDFS}seeAlso`), null)) {
    if (o.termType !== "NamedNode") {
      found.push({
        term: c.iri,
        rule: "see-also-not-iri",
        message: `${c.id}: rdfs:seeAlso "${o.value}" is a ${o.termType}; it must be an IRI <https://…>`,
        property: "rdfs:seeAlso",
        value: o.value,
        found: o.termType,
      });
    } else if (!/^https?:\/\//.test(o.value)) {
      found.push({
        term: c.iri,
        rule: "see-also-not-http",
        message: `${c.id}: rdfs:seeAlso <${o.value}> is not an http(s) URL`,
        property: "rdfs:seeAlso",
        value: o.value,
      });
    }
  }
  return found;
}

/** Each cycle of the hierarchy, once, as the IRIs it goes through: a, b, a. */
function cycles(known: Map<string, Node>): Problem[] {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const found: Problem[] = [];
  const visit = (iri: string) => {
    state.set(iri, "visiting");
    stack.push(iri);
    for (const parent of known.get(iri)!.broader) {
      if (!known.has(parent)) continue;
      if (state.get(parent) === "visiting") {
        const path = [...stack.slice(stack.indexOf(parent)), parent];
        found.push({
          term: path[0],
          rule: "broader-cycle",
          message: `skos:broader has a cycle: ${path.map(localName).join(" → ")}`,
          values: path,
        });
      } else if (!state.has(parent)) visit(parent);
    }
    stack.pop();
    state.set(iri, "done");
  };
  for (const iri of known.keys()) if (!state.has(iri)) visit(iri);
  return found;
}
