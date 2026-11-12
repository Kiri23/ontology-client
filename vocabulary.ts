/**
 * Read, query, check and create SKOS vocabularies written in Turtle.
 *
 * ```ts
 * import { Vocabulary } from "jsr:@kiri23/ontology-client/vocabulary";
 *
 * const vocab = Vocabulary.read("docs/vocabulary.ttl");
 * vocab.term("provider").label(); // "Provider"
 * vocab.term("provider").narrower().ids(); // ["harness", "endpoint"]
 * vocab.terms().where("doc:symbol").missing().ids(); // a predicate of your own, by prefix
 * vocab.check().language("en").oneScheme().problems(); // [{ term, rule, message }]
 * ```
 *
 * Three pieces: a {@link Vocabulary} (the file), a {@link Term} (one `skos:Concept`; it is a {@link Resource}, like
 * the scheme or a page of your own) and {@link Terms} (a list you keep chaining on). The graph underneath is an n3
 * `Store` and it is yours: `vocab.store`.
 *
 * The library knows SKOS and nothing about any repo. What a repo adds (a predicate, a type, a rule) is
 * built on top with `values()`, `where()`, `instancesOf()` and the store.
 *
 * In Deno, n3 needs `--allow-env=READABLE_STREAM`; `read` and `write` need `--allow-read` and `--allow-write`.
 *
 * @module
 */

// vocabulary.ts — the entry `./vocabulary` of the package: the Vocabulary class, and the names the files of
// vocabulary/ export. It is not re-exported from mod.ts, so importing the client does not load n3.

// @ts-types="@types/n3"
import { DataFactory, type NamedNode, Parser, type Quad, Store, Writer } from "n3";
import { Check } from "./vocabulary/check.ts";
import { ResourceEditor, TermEditor } from "./vocabulary/edit.ts";
import { expand, namespaceOf, RDF_TYPE, SKOS, WELL_KNOWN } from "./vocabulary/names.ts";
import { inOrder, remember } from "./vocabulary/order.ts";
import { isTerm, Resource, type SubjectNode, Term, Terms } from "./vocabulary/terms.ts";

export { Check, type Problem, type Rule } from "./vocabulary/check.ts";
export { ResourceEditor, TermEditor } from "./vocabulary/edit.ts";
export { DCT, localName, namespaceOf, RDF, RDFS, SKOS } from "./vocabulary/names.ts";
export { type Literal, Resource, type SubjectNode, Term, Terms, Where } from "./vocabulary/terms.ts";

const { namedNode, quad } = DataFactory;

/** The two functions of `node:fs` that `read` and `write` use. */
interface Disk {
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, text: string): void;
}

/** The disk of Deno or Node, asked for only when `read` or `write` run: a browser never gets here. */
function disk(): Disk {
  const { process } = globalThis as { process?: { getBuiltinModule?: (name: string) => unknown } };
  const fs = process?.getBuiltinModule?.("node:fs");
  if (!fs) {
    throw new Error(
      "Vocabulary.read and .write need the disk of Deno or Node (22.3 or newer). Anywhere else, read the text " +
        "yourself and use Vocabulary.parse(text) and .toTurtle()",
    );
  }
  return fs as Disk;
}

/**
 * A SKOS vocabulary: its terms, its concept scheme and whatever else the Turtle says.
 *
 * ```ts
 * // Read and walk
 * const vocab = Vocabulary.read("docs/vocabulary.ttl"); // or Vocabulary.parse(ttl): no disk
 * vocab.has("provider"); // true
 * vocab.term("provider").values("doc:symbol"); // a predicate of your own repo
 * vocab.instancesOf("doc:Page").map((page) => page.values("doc:path"));
 *
 * // Create
 * const fresh = Vocabulary.create("https://example.com/vocabulary#").language("en");
 * fresh.scheme("vocabulary").label("Demo");
 * fresh.add("provider").label("Provider").definition("Who serves the model.");
 * fresh.add("harness").label("Harness").definition("…").broader("provider");
 * fresh.toTurtle();
 * ```
 *
 * To add something general, follow what is here: a reading method returns Resources, Terms or what is written; a
 * writing method returns an editor or the vocabulary, so it chains. Nothing about one repo belongs in this class.
 */
export class Vocabulary {
  /**
   * The n3 `Store` with every statement, as it is. Query it or add to it directly when the methods here fall short;
   * terms and checks read from it every time, so they see what you add.
   */
  readonly store: Store;
  /**
   * The prefixes the Turtle declares, as prefix → namespace (`{ skos: "http://www.w3.org/2004/02/skos/core#" }`).
   * `toTurtle()` writes them back.
   */
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

  /**
   * A vocabulary from Turtle text. It touches no disk, so it also runs in a browser.
   *
   * Throws the error of n3, with the line, when the text is not Turtle.
   */
  static parse(turtle: string): Vocabulary {
    const prefixes: Record<string, string> = {};
    const quads = new Parser().parse(turtle, null, (prefix, namespace) => {
      prefixes[prefix] = namespace.value;
    });
    return new Vocabulary(quads, prefixes);
  }

  /** A vocabulary from a Turtle file. Runs in Deno and Node; throws like `parse`, and when the file is not there. */
  static read(path: string): Vocabulary {
    return Vocabulary.parse(disk().readFileSync(path, "utf8"));
  }

  /**
   * An empty vocabulary whose terms will live in `namespace` (`"https://example.com/vocabulary#"`). Fill it with
   * `scheme(id)` and `add(id)`.
   */
  static create(namespace: string): Vocabulary {
    return new Vocabulary([], { skos: SKOS }, namespace);
  }

  /**
   * Where a bare name like `"provider"` lives. The one given to `create`; for a vocabulary that was read, the
   * namespace its terms share, or `undefined` if they do not share one.
   */
  get namespace(): string | undefined {
    if (this.#namespace !== undefined) return this.#namespace;
    const shared = new Set(this.terms().map((t) => namespaceOf(t.iri)));
    return shared.size === 1 ? [...shared][0] : undefined;
  }

  /** The language new labels and definitions are written in; `""` when none was set. */
  get defaultLanguage(): string {
    return this.#language;
  }

  /**
   * The IRI a name stands for: a whole IRI stays, `doc:symbol` expands with its prefix, and a bare `provider` goes in
   * the namespace. Throws on a prefix nobody declared.
   */
  iri(name: string): string {
    return expand(name, this.prefixes, name.includes(":") ? undefined : this.namespace);
  }

  /**
   * The IRI of a predicate or a type: `doc:symbol` by prefix, or a whole IRI. Throws on a bare name (`"prefLabel"`):
   * it would go in the namespace of the terms and silently match nothing.
   */
  predicate(name: string): string {
    if (!name.includes(":")) {
      throw new Error(`"${name}" is not a predicate: write it with its prefix ("skos:${name}") or as a whole IRI`);
    }
    return this.iri(name);
  }

  // Read

  /** Every term, in the order of the file: each IRI that is `a skos:Concept`. */
  terms(): Terms {
    const concepts = this.store.getSubjects(namedNode(RDF_TYPE), namedNode(`${SKOS}Concept`), null);
    const nodes = concepts.filter((s): s is NamedNode => isTerm(this, s));
    return new Terms(this, inOrder(this.store, nodes).map((node) => new Term(this, node)));
  }

  /**
   * One term, by local name (`"provider"`) or by IRI.
   *
   * Throws when there is no such term, naming the ones there are; ask `has()` first when you are not sure.
   */
  term(id: string): Term {
    const found = this.#find(id);
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      throw new Error(
        `"${id}" names ${found.length} terms (${found.map((t) => t.iri).join(", ")}): ask for one by its IRI`,
      );
    }
    const ids = this.terms().ids();
    const some = ids.slice(0, 12).join(", ") + (ids.length > 12 ? "…" : "");
    throw new Error(`No term "${id}" in this vocabulary. It has ${ids.length}${some ? `: ${some}` : ""}`);
  }

  /** Whether there is a term with this local name or IRI. */
  has(id: string): boolean {
    return this.#find(id).length > 0;
  }

  /** The concept scheme of the file: the first `skos:ConceptScheme`, or `undefined` when there is none. */
  scheme(): Resource | undefined;
  /**
   * Declares a concept scheme with this local name (or returns the one that is there) to write its label and
   * definition. Terms added afterwards go in it.
   */
  scheme(id: string): ResourceEditor;
  scheme(id?: string): Resource | ResourceEditor | undefined {
    if (id === undefined) return this.schemes()[0];
    const node = namedNode(this.iri(id));
    remember(this.store, node.value);
    this.store.addQuad(quad(node, namedNode(RDF_TYPE), namedNode(`${SKOS}ConceptScheme`)));
    return new ResourceEditor(this, node);
  }

  /** Every `skos:ConceptScheme` the file declares. A vocabulary usually has one. */
  schemes(): Resource[] {
    return this.instancesOf(`${SKOS}ConceptScheme`);
  }

  /**
   * Every resource of a type, by prefix or IRI: `vocab.instancesOf("doc:Page")`. For what is in the file and is not
   * a term.
   */
  instancesOf(type: string): Resource[] {
    const subjects = this.store.getSubjects(namedNode(RDF_TYPE), namedNode(this.predicate(type)), null);
    return inOrder(this.store, subjects as SubjectNode[]).map((node) => new Resource(this, node));
  }

  /** Any resource by name, whether or not the file says something about it. */
  resource(name: string): Resource {
    return new Resource(this, namedNode(this.iri(name)));
  }

  /** Starts a check of the rules; see {@link Check}. */
  check(): Check {
    return new Check(this);
  }

  // Write

  /** Sets the language new labels and definitions are written in (`"en"`, `"es"`). */
  language(tag: string): this {
    this.#language = tag.toLowerCase();
    return this;
  }

  /** Declares a prefix, so `"doc:symbol"` can be read and written: `.prefix("doc", "https://example.com/doc#")`. */
  prefix(name: string, namespace: string): this {
    this.prefixes[name] = namespace;
    return this;
  }

  /**
   * Adds a term and returns its editor. It is born `a skos:Concept`, and in the concept scheme when the vocabulary
   * has exactly one. Throws when the name is taken: use `edit()` for a term that exists.
   */
  add(id: string): TermEditor {
    const node = namedNode(this.iri(id));
    if (this.store.countQuads(node, null, null, null) > 0) {
      throw new Error(`"${id}" is already in this vocabulary (<${node.value}>): use edit("${id}") to change it`);
    }
    remember(this.store, node.value);
    this.store.addQuad(quad(node, namedNode(RDF_TYPE), namedNode(`${SKOS}Concept`)));
    const editor = new TermEditor(this, node);
    const schemes = this.schemes().filter((s) => !s.blank);
    return schemes.length === 1 ? editor.inScheme(schemes[0].iri) : editor;
  }

  /** The editor of a term that exists. Throws like `term()` when it does not. */
  edit(id: string): TermEditor {
    return new TermEditor(this, this.term(id).node);
  }

  /**
   * Removes a term: what the file says about it, and every statement that points to it, so nothing is left hanging.
   * Throws like `term()` when it does not exist.
   */
  remove(id: string): this {
    const { node } = this.term(id);
    this.store.removeQuads([
      ...this.store.getQuads(node, null, null, null),
      ...this.store.getQuads(null, null, node, null),
    ]);
    return this;
  }

  /**
   * The vocabulary as Turtle text, one block per resource in the order they were written.
   *
   * **It is for files this library creates or generates, not for rewriting one written by hand.** The text comes out
   * of the n3 Writer: the comments, the blank lines and the layout of the original file are gone. To change a
   * hand-written vocabulary, edit its Turtle.
   */
  toTurtle(): string {
    const quads = this.store.getQuads(null, null, null, null);
    const writer = new Writer({ prefixes: this.#prefixesToWrite(quads) });
    const subjects = new Map(quads.map((q) => [q.subject.value, q.subject]));
    for (const subject of inOrder(this.store, [...subjects.values()])) {
      const about = quads.filter((q) => q.subject.equals(subject));
      const isType = (q: Quad) => q.predicate.value === RDF_TYPE;
      writer.addQuads([...about.filter(isType), ...about.filter((q) => !isType(q))]);
    }
    let turtle = "";
    writer.end((_error: unknown, text: string) => (turtle = text));
    return turtle;
  }

  /**
   * Writes `toTurtle()` to a file, replacing it. Runs in Deno and Node.
   *
   * **Same warning as `toTurtle()`: a file written by hand loses its comments and its layout.**
   */
  write(path: string): void {
    disk().writeFileSync(path, this.toTurtle());
  }

  #find(id: string): Term[] {
    const terms = this.terms().toArray();
    if (!id.includes(":")) return terms.filter((t) => t.id === id);
    const iri = this.iri(id);
    return terms.filter((t) => t.iri === iri);
  }

  /** The declared prefixes, plus one for the namespace and the well-known ones the statements use. */
  #prefixesToWrite(quads: Quad[]): Record<string, string> {
    const prefixes = { ...this.prefixes };
    const bound = new Set(Object.values(prefixes));
    const used = (namespace: string) =>
      quads.some((q) =>
        q.predicate.value !== RDF_TYPE && [q.subject, q.predicate, q.object].some((t) => t.value.startsWith(namespace))
      );
    if (this.#namespace !== undefined && !bound.has(this.#namespace) && !("" in prefixes)) {
      prefixes[""] = this.#namespace;
    }
    for (const [prefix, namespace] of Object.entries(WELL_KNOWN)) {
      if (!bound.has(namespace) && !(prefix in prefixes) && used(namespace)) prefixes[prefix] = namespace;
    }
    return prefixes;
  }
}
