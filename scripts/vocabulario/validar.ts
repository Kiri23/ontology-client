// validar.ts — qué reglas le pide este repo a un vocabulario, y los errores en español.
//
// Las reglas viven en la librería (`vocabulary/check.ts`, la entrada `./vocabulary` del paquete): acá solo se eligen
// y se traducen. `reglasDelRepo` son las de docs/vocabulary.ttl: en inglés, en el namespace v: y con los seeAlso como
// links. La del esquema (un solo skos:ConceptScheme y cada término adentro) es la que exige el servidor en
// POST /vocabularios; `validarEsquema` la corre sola. Un vocabulario externo (externo.ts) arma su propia revisión,
// con su idioma, su namespace y sus vocabularios de contexto.
//
// Cada problema trae una regla con nombre fijo; `enEspanol` escribe el texto de cada una. Una regla nueva de la
// librería sin su texto acá no compila.
//
// `validarEnlaces` suma la regla de la prosa: un link a docs/vocabulary/<slug>.md tiene que nombrar un término que
// exista. La prosa no puede citar algo que no está en el TTL.

import { type Check, localName, type Problem, type Rule, type Vocabulary } from "@kiri23/ontology-client/vocabulary";
import type { Enlace } from "./menciones.ts";

export const NAMESPACE = "https://kiri231.com/vocabulario/ontology-client#";

// Las reglas de docs/vocabulary.ttl, sin la del esquema.
export function reglasDelRepo(vocabulario: Vocabulary): Check {
  return vocabulario.check().language("en").namespace(NAMESPACE).seeAlsoUrls();
}

// Las reglas que hablan del esquema: sus errores van primero.
const DEL_ESQUEMA = new Set<Rule>(["scheme-count", "in-scheme"]);

// El texto en español de cada regla.
const TEXTOS: Record<Rule, (p: Problem, slug: string) => string> = {
  "no-concepts": () => "el vocabulario no tiene ningún skos:Concept",
  "not-a-concept": (_p, slug) => `${slug}: tiene skos:prefLabel o skos:definition pero no es \`a skos:Concept\``,
  "blank-node": (p) => `nodo en blanco "${p.value}": un término necesita un IRI ${p.expected ?? ""}<local name>`,
  "missing-target": (p, slug) =>
    `${slug}: ${p.property} apunta a ${p.value}, que no es un skos:Concept del vocabulario`,
  "related-self": (_p, slug) => `${slug}: skos:related apunta a sí mismo`,
  "related-broader-overlap": (p, slug) =>
    `${slug}: skos:related y skos:broader (directo o transitivo) unen ${slug} con ${localName(p.value!)}; ` +
    "SKOS los quiere disjuntos",
  "broader-cycle": (p) => `ciclo en skos:broader: ${p.values!.map(localName).join(" → ")}`,
  "language": (p, slug) =>
    `${slug}: ${p.property} "${p.value}" ${
      p.found ? `tiene idioma @${p.found}` : "no tiene etiqueta de idioma"
    }; se espera @${p.expected}`,
  "cardinality": (p, slug) =>
    `${slug}: tiene ${p.count} ${p.property} en @${p.expected}; tiene que tener exactamente uno`,
  "empty": (p, slug) => `${slug}: ${p.property} está vacío`,
  "namespace": (p) => `${p.term}: un término tiene que estar en el namespace ${p.expected}`,
  "local-name": (p) =>
    `${p.term}: el local name "${p.value}" tiene que ser minúsculas, dígitos y guiones, y no "readme"`,
  "scheme-count": (p) =>
    `el vocabulario tiene ${p.count} skos:ConceptScheme${p.values!.length ? ` (${p.values!.join(", ")})` : ""}; ` +
    "tiene que declarar exactamente uno, y cada término ser skos:inScheme de ese",
  "in-scheme": (p, slug) =>
    p.count === 1
      ? `${slug}: skos:inScheme <${p.values![0]}> no es el esquema del archivo, <${p.expected}>`
      : `${slug}: tiene ${p.count} skos:inScheme; tiene que tener exactamente uno, <${p.expected}>`,
  "see-also-not-iri": (p, slug) =>
    `${slug}: rdfs:seeAlso "${p.value}" es un ${p.found}; tiene que ser un IRI <https://…>`,
  "see-also-not-http": (p, slug) => `${slug}: rdfs:seeAlso <${p.value}> no es una URL http(s)`,
};

// Los problemas de una revisión como renglones en español: los del esquema primero, el resto en su orden.
export function enEspanol(problemas: Problem[]): string[] {
  const ordenados = [
    ...problemas.filter((p) => DEL_ESQUEMA.has(p.rule)),
    ...problemas.filter((p) => !DEL_ESQUEMA.has(p.rule)),
  ];
  return ordenados.map((p) => TEXTOS[p.rule](p, localName(p.term)));
}

// Los errores de las reglas del repo, sin la del esquema; vacío si el vocabulario está bien.
export function validar(vocabulario: Vocabulary): string[] {
  return enEspanol(reglasDelRepo(vocabulario).problems());
}

// El esquema del archivo y la pertenencia de cada término: lo que POST /vocabularios exige además de `validar`.
export function validarEsquema(vocabulario: Vocabulary): string[] {
  return enEspanol(vocabulario.check().oneScheme().problems().filter((p) => DEL_ESQUEMA.has(p.rule)));
}

// Un error por link de la prosa a una página que el TTL no genera, con archivo, línea y link.
export function validarEnlaces(enlaces: Enlace[], vocabulario: Vocabulary): string[] {
  const slugs = new Set(vocabulario.terms().ids());
  return enlaces.filter((e) => !slugs.has(e.slug)).map((e) =>
    `${e.archivo}:${e.linea}: el link (${e.link}) apunta a docs/vocabulary/${e.slug}.md, y "${e.slug}" no es un ` +
    "término de docs/vocabulary.ttl"
  );
}
