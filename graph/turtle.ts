// turtle.ts — the way in and out of a file: Turtle text to statements and prefixes, a store back to Turtle, and the
// disk. Graph (graph.ts) and Vocabulary (vocabulary.ts) both read and write with these, so a file comes out the same
// from either.

// @ts-types="@types/n3"
import { Parser, type Quad, type Store, Writer } from "n3";
import { RDF_TYPE, WELL_KNOWN } from "./names.ts";
import { inOrder } from "./order.ts";

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
 */
export function writeTurtle(store: Store, prefixes: Record<string, string>, namespace?: string): string {
  const quads = store.getQuads(null, null, null, null);
  const writer = new Writer({ prefixes: prefixesToWrite(quads, prefixes, namespace) });
  const subjects = new Map(quads.map((q) => [q.subject.value, q.subject]));
  for (const subject of inOrder(store, [...subjects.values()])) {
    const about = quads.filter((q) => q.subject.equals(subject));
    const isType = (q: Quad) => q.predicate.value === RDF_TYPE;
    writer.addQuads([...about.filter(isType), ...about.filter((q) => !isType(q))]);
  }
  let turtle = "";
  writer.end((_error: unknown, text: string) => (turtle = text));
  return turtle;
}

function prefixesToWrite(quads: Quad[], declared: Record<string, string>, namespace?: string): Record<string, string> {
  const prefixes = { ...declared };
  const bound = new Set(Object.values(prefixes));
  const used = (ns: string) =>
    quads.some((q) =>
      q.predicate.value !== RDF_TYPE && [q.subject, q.predicate, q.object].some((t) => t.value.startsWith(ns))
    );
  if (namespace !== undefined && !bound.has(namespace) && !("" in prefixes)) prefixes[""] = namespace;
  for (const [prefix, ns] of Object.entries(WELL_KNOWN)) {
    if (!bound.has(ns) && !(prefix in prefixes) && used(ns)) prefixes[prefix] = ns;
  }
  return prefixes;
}
