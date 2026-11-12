// names.ts — how a name written in code becomes an IRI, and the few IRIs the library knows by heart.
//
// vocabulary.ts and the files next to this one call it; nothing here touches a graph.

/** The SKOS namespace: every `skos:` name the library reads or writes hangs from it. */
export const SKOS = "http://www.w3.org/2004/02/skos/core#";
/** The RDF namespace. */
export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
/** The RDFS namespace. */
export const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
/** The Dublin Core terms namespace. */
export const DCT = "http://purl.org/dc/terms/";

/** `rdf:type`, what `a` means in Turtle. */
export const RDF_TYPE: string = `${RDF}type`;

/** Prefixes that work even when the Turtle file does not declare them. A declaration in the file wins. */
export const WELL_KNOWN: Readonly<Record<string, string>> = { rdf: RDF, rdfs: RDFS, skos: SKOS, dct: DCT };

/** Names that start like a prefix but are already whole IRIs. */
const IRI_SCHEMES = new Set(["urn", "mailto", "tel", "file", "data"]);

/** The local name of an IRI: what follows the last `#` or `/`. `"https://example.com/v#provider"` → `"provider"`. */
export function localName(iri: string): string {
  return iri.slice(Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/")) + 1);
}

/** What is left of an IRI without its local name: `"https://example.com/v#provider"` → `"https://example.com/v#"`. */
export function namespaceOf(iri: string): string {
  return iri.slice(0, iri.length - localName(iri).length);
}

/**
 * The IRI a name stands for.
 *
 * - a whole IRI (`https://…`, `urn:…`) stays as it is;
 * - `doc:symbol` expands with the prefix the Turtle declares, or with a well-known one (`skos:`, `rdf:`, `rdfs:`,
 *   `dct:`);
 * - a bare name (`provider`) goes in `namespace`.
 *
 * Throws when the prefix is unknown or when a bare name has no namespace to go in: a typo must not turn into an IRI
 * that silently matches nothing.
 */
export function expand(name: string, prefixes: Readonly<Record<string, string>>, namespace?: string): string {
  const colon = name.indexOf(":");
  if (colon < 0) {
    if (namespace === undefined) {
      throw new Error(
        `"${name}" is a bare name and this vocabulary has no single namespace to put it in: pass the whole IRI`,
      );
    }
    return namespace + name;
  }
  const prefix = name.slice(0, colon);
  const rest = name.slice(colon + 1);
  if (Object.hasOwn(prefixes, prefix)) return prefixes[prefix] + rest;
  if (rest.startsWith("//") || IRI_SCHEMES.has(prefix)) return name;
  if (Object.hasOwn(WELL_KNOWN, prefix)) return WELL_KNOWN[prefix] + rest;
  throw new Error(
    `Unknown prefix "${prefix}:" in "${name}": declare it with @prefix in the Turtle (or with .prefix()), ` +
      "or pass the whole IRI",
  );
}
