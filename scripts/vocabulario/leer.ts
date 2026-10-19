// leer.ts — de un vocabulary.ttl (Turtle) a la lista de términos SKOS, sin validar nada.
//
// Un término es todo sujeto que es `a skos:Concept` o que tiene skos:prefLabel o skos:definition: así un término al
// que le falta el tipo no desaparece en silencio, lo rechaza el validador. Un `a skos:ConceptScheme` no es término:
// lo devuelve `esquemas` (su label y su definición encabezan el índice de un vocabulario externo). Los literales
// guardan su idioma y los seeAlso su tipo de nodo para que el validador pueda exigir el idioma del vocabulario e IRIs;
// broader/related quedan como IRI aunque el concepto no exista.

// @ts-types="@types/n3"
import { Parser, type Quad } from "n3";

const SKOS = "http://www.w3.org/2004/02/skos/core#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SEE_ALSO = "http://www.w3.org/2000/01/rdf-schema#seeAlso";

export interface Literal {
  valor: string;
  // "" si el literal no tiene etiqueta de idioma. n3 la devuelve en minúsculas ("en-us").
  idioma: string;
}

export interface Objeto {
  valor: string;
  // El termType de n3: "NamedNode", "Literal", "BlankNode"…
  tipo: string;
}

export interface Concepto {
  // El IRI, o el id que n3 le da a un nodo en blanco.
  iri: string;
  enBlanco: boolean;
  // Si el TTL dice `a skos:Concept`.
  esConcepto: boolean;
  // Si el TTL dice `a skos:ConceptScheme`: entonces no es término.
  esEsquema: boolean;
  // El local name del IRI (lo que sigue al último # o /): nombre de la página.
  slug: string;
  prefLabel: Literal[];
  definition: Literal[];
  example: Literal[];
  broader: string[];
  related: string[];
  seeAlso: Objeto[];
}

// El local name de un IRI: lo que sigue al último # o /.
export function slugDe(iri: string): string {
  return iri.slice(Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/")) + 1);
}

// Los triples del TTL. Lanza el error de n3 (con la línea) si el texto no es Turtle.
export function triples(ttl: string): Quad[] {
  return new Parser().parse(ttl);
}

// Los @prefix del TTL como namespace → prefijo ("https://kiri23.dev/ambiente#" → "ambiente"). Lanza como `triples`.
export function prefijos(ttl: string): Map<string, string> {
  const vistos = new Map<string, string>();
  new Parser().parse(ttl, null, (prefijo, iri) => {
    if (prefijo) vistos.set(iri.value, prefijo);
  });
  return vistos;
}

// Lanza el error de n3 (con la línea) si el texto no es Turtle.
export function leer(ttl: string): Concepto[] {
  return conceptos(triples(ttl));
}

export function conceptos(quads: Quad[]): Concepto[] {
  return sujetos(quads).filter((c) => !c.esEsquema);
}

// Los `a skos:ConceptScheme` del TTL, con sus literales y seeAlso.
export function esquemas(quads: Quad[]): Concepto[] {
  return sujetos(quads).filter((c) => c.esEsquema);
}

function sujetos(quads: Quad[]): Concepto[] {
  const terminos = new Map<string, Concepto>();
  const termino = (sujeto: { value: string; termType: string }): Concepto => {
    const nuevo = {
      iri: sujeto.value,
      enBlanco: sujeto.termType === "BlankNode",
      esConcepto: false,
      esEsquema: false,
      slug: slugDe(sujeto.value),
      prefLabel: [],
      definition: [],
      example: [],
      broader: [],
      related: [],
      seeAlso: [],
    };
    if (!terminos.has(sujeto.value)) terminos.set(sujeto.value, nuevo);
    return terminos.get(sujeto.value)!;
  };
  for (const q of quads) {
    const o = q.object;
    const literal = { valor: o.value, idioma: o.termType === "Literal" ? o.language : "" };
    switch (q.predicate.value) {
      case RDF_TYPE:
        if (o.value === `${SKOS}Concept`) termino(q.subject).esConcepto = true;
        if (o.value === `${SKOS}ConceptScheme`) termino(q.subject).esEsquema = true;
        break;
      case `${SKOS}prefLabel`:
        termino(q.subject).prefLabel.push(literal);
        break;
      case `${SKOS}definition`:
        termino(q.subject).definition.push(literal);
        break;
    }
  }
  for (const q of quads) {
    const c = terminos.get(q.subject.value);
    if (!c) continue;
    switch (q.predicate.value) {
      case `${SKOS}broader`:
        c.broader.push(q.object.value);
        break;
      case `${SKOS}related`:
        c.related.push(q.object.value);
        break;
      case `${SKOS}example`:
        c.example.push({ valor: q.object.value, idioma: q.object.termType === "Literal" ? q.object.language : "" });
        break;
      case RDFS_SEE_ALSO:
        c.seeAlso.push({ valor: q.object.value, tipo: q.object.termType });
        break;
    }
  }
  return [...terminos.values()];
}
