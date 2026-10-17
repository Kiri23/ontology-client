// leer.ts — de docs/vocabulary.ttl (Turtle) a la lista de conceptos SKOS, sin validar nada.
//
// Junta lo que el TTL dice de cada sujeto que es `a skos:Concept`. Los literales guardan su idioma para que el
// validador pueda exigir @en; los objetos de broader/related quedan como IRI aunque no exista el concepto.

// @ts-types="@types/n3"
import { Parser } from "n3";

const SKOS = "http://www.w3.org/2004/02/skos/core#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SEE_ALSO = "http://www.w3.org/2000/01/rdf-schema#seeAlso";

export interface Literal {
  valor: string;
  // "" si el literal no tiene etiqueta de idioma.
  idioma: string;
}

export interface Concepto {
  iri: string;
  // El local name del IRI (lo que sigue al último # o /): nombre de la página.
  slug: string;
  prefLabel: Literal[];
  definition: Literal[];
  broader: string[];
  related: string[];
  seeAlso: string[];
}

// El local name de un IRI: lo que sigue al último # o /.
export function slugDe(iri: string): string {
  return iri.slice(Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/")) + 1);
}

// Lanza el error de n3 (con la línea) si el texto no es Turtle.
export function leer(ttl: string): Concepto[] {
  const quads = new Parser().parse(ttl);
  const conceptos = new Map<string, Concepto>();
  for (const q of quads) {
    if (q.predicate.value === RDF_TYPE && q.object.value === `${SKOS}Concept`) {
      const iri = q.subject.value;
      conceptos.set(iri, {
        iri,
        slug: slugDe(iri),
        prefLabel: [],
        definition: [],
        broader: [],
        related: [],
        seeAlso: [],
      });
    }
  }
  for (const q of quads) {
    const c = conceptos.get(q.subject.value);
    if (!c) continue;
    const o = q.object;
    const literal = { valor: o.value, idioma: o.termType === "Literal" ? o.language : "" };
    switch (q.predicate.value) {
      case `${SKOS}prefLabel`:
        c.prefLabel.push(literal);
        break;
      case `${SKOS}definition`:
        c.definition.push(literal);
        break;
      case `${SKOS}broader`:
        c.broader.push(o.value);
        break;
      case `${SKOS}related`:
        c.related.push(o.value);
        break;
      case RDFS_SEE_ALSO:
        c.seeAlso.push(o.value);
        break;
    }
  }
  return [...conceptos.values()];
}
