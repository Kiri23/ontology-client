// renderizar.ts — de los conceptos (ya validados: todos skos:Concept, ninguno related a sí mismo) a los markdown de
// docs/vocabulary/: una página por término, <slug>.md, y README.md como índice. Devuelve nombre de archivo →
// contenido, sin tocar el disco.
//
// Narrower lo calcula el script como inverso de skos:broader, y Related sale en las dos páginas aunque el triple
// esté en una sola: en el TTL nadie escribe ninguno de los dos lados que faltan. Todo va ordenado por label para
// que la salida no dependa del orden del TTL.
//
// Mentioned in sale del grafo (el TTL más los triples de menciones.ts): la consulta inversa `?doc dct:references
// v:<slug>`. Nunca sale de docs/vocabulary/, que es la salida de este script.

// @ts-types="@types/n3"
import { DataFactory, type Store } from "n3";
import type { Concepto } from "./leer.ts";
import { DCT_REFERENCES } from "./menciones.ts";

export const CABECERA =
  "<!-- Generated from docs/vocabulary.ttl by `deno task vocabulario`. Do not edit by hand: edit the TTL and run the task. -->";

const label = (c: Concepto) => c.prefLabel.find((l) => l.idioma === "en")!.valor;
const definicion = (c: Concepto) => c.definition.find((l) => l.idioma === "en")!.valor;
const enlace = (c: Concepto) => `[${label(c)}](${c.slug}.md)`;

// Por label sin mayúsculas y después por slug: comparación por código, igual en cualquier máquina.
function ordenar(conceptos: Concepto[]): Concepto[] {
  const clave = (c: Concepto) => `${label(c).toLowerCase()}\u0000${c.slug}`;
  return [...conceptos].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0));
}

function seccion(titulo: string, items: string[]): string[] {
  return items.length ? [`**${titulo}**`, "", ...items.map((i) => `- ${i}`), ""] : [];
}

// Los archivos de prosa que enlazan `c`, en orden, como links que andan desde docs/vocabulary/. Sin repetidos de
// fábrica: el Store guarda cada triple una vez, así dos links del mismo archivo al mismo término son una mención.
function menciones(c: Concepto, grafo: Store): string[] {
  const { namedNode } = DataFactory;
  const docs = grafo.getSubjects(namedNode(DCT_REFERENCES), namedNode(c.iri), null).map((s) => s.value);
  return docs.sort().map((ruta) => `[${ruta}](../../${ruta})`);
}

function pagina(c: Concepto, todos: Concepto[], porIri: Map<string, Concepto>, grafo: Store): string {
  const conceptos = (iris: Iterable<string>) => ordenar([...new Set(iris)].map((i) => porIri.get(i)!));
  const broader = conceptos(c.broader);
  const narrower = conceptos(todos.filter((o) => o.broader.includes(c.iri)).map((o) => o.iri));
  const related = conceptos([...c.related, ...todos.filter((o) => o.related.includes(c.iri)).map((o) => o.iri)]);
  const lineas = [
    CABECERA,
    "",
    `# ${label(c)}`,
    "",
    definicion(c),
    "",
    ...seccion("Broader", broader.map(enlace)),
    ...seccion("Narrower", narrower.map(enlace)),
    ...seccion("Related", related.map(enlace)),
    ...seccion("See also", [...new Set(c.seeAlso.map((o) => o.valor))].sort().map((url) => `<${url}>`)),
    ...seccion("Mentioned in", menciones(c, grafo)),
  ];
  return lineas.join("\n").trimEnd() + "\n";
}

function indice(conceptos: Concepto[]): string {
  const lineas = [
    CABECERA,
    "",
    "# Vocabulary",
    "",
    "The terms this project uses, one page each. The source is [`docs/vocabulary.ttl`](../vocabulary.ttl), a SKOS vocabulary.",
    "",
    ...ordenar(conceptos).map((c) => `- ${enlace(c)}: ${definicion(c)}`),
  ];
  return lineas.join("\n") + "\n";
}

// Nombre de archivo (relativo a docs/vocabulary/) → contenido, con las claves en orden.
export function renderizar(conceptos: Concepto[], grafo: Store): Map<string, string> {
  const porIri = new Map(conceptos.map((c) => [c.iri, c]));
  const archivos = new Map<string, string>([["README.md", indice(conceptos)]]);
  for (const c of [...conceptos].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    archivos.set(`${c.slug}.md`, pagina(c, conceptos, porIri, grafo));
  }
  return archivos;
}
