// turtle.ts — the way in and out of a file: Turtle text to statements and prefixes, a store back to Turtle, and the
// disk. Vocabulary (vocabulary.ts) and Graph (graph.ts) both read and write with these, so a file comes out the same
// from either.

// @ts-types="@types/n3"
import { Parser, type Quad, type Store, Writer } from "n3";
import { RDF, RDF_TYPE, WELL_KNOWN } from "./names.ts";
import { inOrder } from "./order.ts";

const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;
/** What Turtle writes with `a` and `( … )`: it needs no prefix. */
const LIST_OR_TYPE = new Set([RDF_TYPE, RDF_FIRST, RDF_REST]);

/** The two functions of `node:fs` that `read` and `write` use. */
interface Disk {
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, text: string): void;
}

/** The disk of Deno or Node, asked for only when `read` or `write` run: a browser never gets here. */
export function disk(who: string): Disk {
  const { process } = globalThis as { process?: { getBuiltinModule?: (name: string) => unknown } };
  const fs = process?.getBuiltinModule?.("node:fs");
  if (!fs) {
    throw new Error(
      `${who}.read and .write need the disk of Deno or Node (22.3 or newer). Anywhere else, read the text ` +
        `yourself and use ${who}.parse(text) and .toTurtle()`,
    );
  }
  return fs as Disk;
}

/** The statements of a Turtle text and the prefixes it declares. Throws the error of n3, with the line. */
export function parseTurtle(turtle: string): { quads: Quad[]; prefixes: Record<string, string> } {
  const prefixes: Record<string, string> = {};
  const quads = new Parser().parse(turtle, null, (prefix, namespace) => {
    prefixes[prefix] = namespace.value;
  });
  return { quads, prefixes };
}

/**
 * The store as Turtle, one block per subject in the order they were written, its types first. The prefixes are the
 * declared ones, plus `:` for the namespace and the well-known ones the statements use.
 *
 * A blank node that only one statement points to is written inside it, as `[ … ]`, and a list as `( … )`: that is how
 * a SHACL property shape reads by hand. Any other blank node keeps its label.
 */
export function writeTurtle(store: Store, prefixes: Record<string, string>, namespace?: string): string {
  const quads = store.getQuads(null, null, null, null);
  const writer = new Writer({ prefixes: prefixesToWrite(quads, prefixes, namespace) });
  const nested = new Nested(writer, quads);
  const subjects = new Map(quads.map((q) => [q.subject.value, q.subject]));
  for (const subject of inOrder(store, [...subjects.values()])) {
    if (nested.isInside(subject)) continue;
    const about = quads.filter((q) => q.subject.equals(subject));
    const isType = (q: Quad) => q.predicate.value === RDF_TYPE;
    for (const q of [...about.filter(isType), ...about.filter((q) => !isType(q))]) {
      writer.addQuad(q.subject, q.predicate, nested.object(q.object));
    }
  }
  let turtle = "";
  writer.end((_error: unknown, text: string) => (turtle = text));
  return turtle;
}

/** The blank nodes that go written inside the one statement that points to them, and how to write them. */
class Nested {
  #writer: Writer;
  #quads: Quad[];
  #inside = new Set<string>();
  #lists = new Map<string, Quad["object"][]>();

  constructor(writer: Writer, quads: Quad[]) {
    this.#writer = writer;
    this.#quads = quads;
    const pointedTo = new Map<string, number>();
    for (const q of quads) {
      if (q.object.termType === "BlankNode") pointedTo.set(q.object.value, (pointedTo.get(q.object.value) ?? 0) + 1);
    }
    for (const [blank, times] of pointedTo) if (times === 1) this.#inside.add(blank);
    for (const head of this.#inside) {
      const items = this.#list(head);
      if (items) this.#lists.set(head, items);
    }
    this.#dropCycles();
  }

  /** Whether the subject is written inside another statement instead of on its own. */
  isInside(subject: Quad["subject"]): boolean {
    return subject.termType === "BlankNode" && this.#inside.has(subject.value);
  }

  /** The object as it goes in the file: a nested blank node or list is written out, anything else stays. */
  object(object: Quad["object"]): Quad["object"] {
    if (object.termType !== "BlankNode" || !this.#inside.has(object.value)) return object;
    const items = this.#lists.get(object.value);
    // @types/n3 says list() gives an array; n3 gives one term, the `( … )` written out.
    if (items) return this.#writer.list(items.map((item) => this.object(item))) as unknown as Quad["object"];
    const about = this.#quads.filter((q) => q.subject.equals(object));
    const blank = this.#writer.blank(about.map((q) => ({ predicate: q.predicate, object: this.object(q.object) })));
    // n3 writes the inside of a blank node at the start of the line; it goes one level in from the statement.
    (blank as unknown as { id: string }).id = (blank as unknown as { id: string }).id.replaceAll("\n", "\n    ");
    return blank;
  }

  /** The items of a well-formed list that starts at `head`, or undefined when it is not one. */
  #list(head: string): Quad["object"][] | undefined {
    const items: Quad["object"][] = [];
    const seen = new Set<string>();
    let node = head;
    while (node !== RDF_NIL) {
      if (seen.has(node) || !this.#inside.has(node)) return undefined;
      seen.add(node);
      const about = this.#quads.filter((q) => q.subject.termType === "BlankNode" && q.subject.value === node);
      const first = about.filter((q) => q.predicate.value === RDF_FIRST);
      const rest = about.filter((q) => q.predicate.value === RDF_REST);
      if (about.length !== 2 || first.length !== 1 || rest.length !== 1) return undefined;
      items.push(first[0].object);
      const next = rest[0].object;
      if (next.termType === "NamedNode" && next.value === RDF_NIL) break;
      if (next.termType !== "BlankNode") return undefined;
      node = next.value;
    }
    return items;
  }

  /** A blank node that is only reachable from itself has nowhere to be written inside: it keeps its label. */
  #dropCycles(): void {
    const reachable = new Set<string>();
    const visit = (object: Quad["object"]) => {
      if (object.termType !== "BlankNode" || !this.#inside.has(object.value) || reachable.has(object.value)) return;
      reachable.add(object.value);
      for (const q of this.#quads) if (q.subject.equals(object)) visit(q.object);
    };
    for (const q of this.#quads) if (!this.isInside(q.subject)) visit(q.object);
    for (const blank of [...this.#inside]) if (!reachable.has(blank)) this.#inside.delete(blank);
  }
}

function prefixesToWrite(quads: Quad[], declared: Record<string, string>, namespace?: string): Record<string, string> {
  const prefixes = { ...declared };
  const bound = new Set(Object.values(prefixes));
  const used = (ns: string) =>
    quads.some((q) =>
      !LIST_OR_TYPE.has(q.predicate.value) && [q.subject, q.predicate, q.object].some((t) => t.value.startsWith(ns))
    );
  if (namespace !== undefined && !bound.has(namespace) && !("" in prefixes)) prefixes[""] = namespace;
  for (const [prefix, ns] of Object.entries(WELL_KNOWN)) {
    if (!bound.has(ns) && !(prefix in prefixes) && used(ns)) prefixes[prefix] = ns;
  }
  return prefixes;
}
