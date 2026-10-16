// El prompt de la AI: el esquema del grafo sacado del Store, tres consultas prearmadas como ejemplos y la pregunta.
// Sin ejemplos E2B no servía (zero-shot 0/1 válida, docs/gemma-en-el-navegador.md §2b); con tres, sí. Las consultas van
// sin las líneas PREFIX: E2B las repetía enteras y se alargaba, y completarPrefijos() (extraer.ts) las agrega después.
// Todo eso se midió con Gemma 4 E2B; con Gemma 3 270M, el modelo de hoy, no se midió.
// Las propiedades con pocos literales distintos llevan sus valores: con el esquema solo, Gemma 4 escribió
// `dcterms:source "HN"` y el dato es "hn" (2026-10-16).
import { type Prearmada, PREARMADAS } from "../logica/consultas.ts";
import type { Termino } from "../logica/modelo.ts";
import { compacto, PREFIJOS, RDF_TYPE } from "../logica/prefijos.ts";
import type { Mensaje } from "./protocolo.ts";

/** Una consulta SELECT contra el Store: cada fila, de variable a valor. */
export type Consultar = (sparql: string) => Map<string, Termino>[];

export interface Clase {
  iri: string;
  instancias: number;
  comentario?: string;
}

export interface Propiedad {
  iri: string;
  /** El rdfs:domain declarado o, si no hay, las clases de los sujetos que la usan. */
  dominio: string[];
  rango?: string;
  comentario?: string;
  /** Sus literales, escritos como van en SPARQL ("hn", true), si son pocos y cortos (ver valoresParaElPrompt). */
  valores?: string[];
}

export interface Esquema {
  clases: Clase[];
  propiedades: Propiedad[];
}

const R = `PREFIX rdf: <${PREFIJOS.rdf}>\nPREFIX rdfs: <${PREFIJOS.rdfs}>\n`;

export const CONSULTA_CLASES_CONTADAS = `${R}SELECT ?c (COUNT(DISTINCT ?s) AS ?n) (SAMPLE(?com) AS ?comentario) WHERE {
  ?s a ?c . OPTIONAL { ?c rdfs:comment ?com }
} GROUP BY ?c ORDER BY DESC(?n) ?c`;

export const CONSULTA_PROPIEDADES_DECLARADAS =
  `${R}SELECT ?p (SAMPLE(?d) AS ?dominio) (SAMPLE(?r) AS ?rango) (SAMPLE(?com) AS ?comentario) WHERE {
  ?p a rdf:Property .
  OPTIONAL { ?p rdfs:domain ?d } OPTIONAL { ?p rdfs:range ?r } OPTIONAL { ?p rdfs:comment ?com }
} GROUP BY ?p`;

export const CONSULTA_USOS = "SELECT DISTINCT ?p ?c WHERE { ?s ?p ?o . ?s a ?c }";

/** Hasta cuántos literales distintos puede tener una propiedad para que vayan en el prompt. */
export const MAXIMO_DE_VALORES = 10;
/** El largo máximo de cada uno: más largo es texto (un nombre, una descripción), no un valor de una lista. */
export const LARGO_DE_VALOR = 40;

// Un literal de una instancia con clase, como en CONSULTA_USOS: los nodos sin clase (la procedencia de cada carga,
// `<urn:kiri-jobs:hn:…> dcterms:source "kiri-jobs -j (hn)"`) no son lo que se pregunta, y el esquema no cuenta.
const LITERAL_DE_INSTANCIA = `?s ?p ?o . FILTER(isLiteral(?o) && EXISTS {
    ?s a ?c . FILTER(?c NOT IN (rdf:Property, rdfs:Class))
  })`;

/** Los literales de las propiedades que tienen pocos distintos. Las que tienen más no vuelven del Store. */
export const CONSULTA_VALORES = `${R}SELECT DISTINCT ?p ?o WHERE {
  { SELECT ?p WHERE { ${LITERAL_DE_INSTANCIA} } GROUP BY ?p HAVING (COUNT(DISTINCT ?o) <= ${MAXIMO_DE_VALORES}) }
  ${LITERAL_DE_INSTANCIA}
} ORDER BY ?p ?o`;

const XSD_STRING = PREFIJOS.xsd + "string";
const BOOLEANO = PREFIJOS.xsd + "boolean";
const ENTERO = PREFIJOS.xsd + "integer";

/** Un literal como se escribe en SPARQL: "hn", true, 3, "hola"@es o "2026-10-12T15:49:24Z"^^xsd:dateTime. */
export function literalSparql({ value, datatype, language }: Termino): string {
  const texto = JSON.stringify(value);
  if (language) return `${texto}@${language}`;
  const tipo = datatype?.value ?? XSD_STRING;
  if (tipo === XSD_STRING) return texto;
  if ((tipo === BOOLEANO && /^(true|false)$/.test(value)) || (tipo === ENTERO && /^-?\d+$/.test(value))) return value;
  return `${texto}^^${compacto(tipo)}`;
}

/**
 * Los valores de una propiedad para el prompt, o nada si alguno es largo: una lista a medias haría creer que no hay
 * más. CONSULTA_VALORES ya dejó afuera las que tienen más de MAXIMO_DE_VALORES.
 */
export function valoresParaElPrompt(literales: Termino[] = []): string[] | undefined {
  if (!literales.length || literales.some((l) => l.value.length > LARGO_DE_VALOR)) return undefined;
  return literales.map(literalSparql);
}

// Las clases del esquema mismo: describen el vocabulario, no los datos que se preguntan.
const META = new Set([PREFIJOS.rdf + "Property", PREFIJOS.rdfs + "Class"]);

/** El esquema que va en el prompt, leído del grafo cargado. */
export function leerEsquema(consultar: Consultar): Esquema {
  const v = (fila: Map<string, { value: string }>, k: string) => fila.get(k)?.value;
  const clases = consultar(CONSULTA_CLASES_CONTADAS)
    .filter((f) => !META.has(v(f, "c")!))
    .map((f) => ({ iri: v(f, "c")!, instancias: Number(v(f, "n")), comentario: v(f, "comentario") }));
  const usos = new Map<string, Set<string>>();
  for (const f of consultar(CONSULTA_USOS)) {
    const [p, c] = [v(f, "p")!, v(f, "c")!];
    if (p === RDF_TYPE || META.has(c)) continue;
    usos.set(p, (usos.get(p) ?? new Set()).add(c));
  }
  const literales = new Map<string, Termino[]>();
  for (const f of consultar(CONSULTA_VALORES)) {
    const p = v(f, "p")!;
    literales.set(p, [...(literales.get(p) ?? []), f.get("o")!]);
  }
  const declaradas = new Map(consultar(CONSULTA_PROPIEDADES_DECLARADAS).map((f) => [v(f, "p")!, f]));
  const iris = [...new Set([...declaradas.keys(), ...usos.keys()])].sort();
  const propiedades = iris.map((iri) => {
    const d = declaradas.get(iri);
    const dominio = d && v(d, "dominio");
    return {
      iri,
      dominio: dominio ? [dominio] : [...(usos.get(iri) ?? [])].sort(),
      rango: d && v(d, "rango"),
      comentario: d && v(d, "comentario"),
      valores: valoresParaElPrompt(literales.get(iri)),
    };
  });
  return { clases, propiedades };
}

const frase = (texto?: string) => (texto ? ` ${texto.trim().replace(/\s+/g, " ")}` : "");

/**
 * El esquema como texto: los prefijos, las clases con cuántas instancias tienen y cada propiedad, sujeto → objeto, con
 * sus valores si son pocos.
 */
export function textoDelEsquema({ clases, propiedades }: Esquema): string {
  const prefijos = Object.entries(PREFIJOS).map(([p, base]) => `${p}: <${base}>`).join("\n");
  const cl = clases.map((c) => `- ${compacto(c.iri)} (${c.instancias}):${frase(c.comentario)}`).join("\n");
  const pr = propiedades.map((p) => {
    const de = p.dominio.map(compacto).join(" o ") || "?";
    const valores = p.valores ? ` Valores: ${p.valores.join(", ")}.` : "";
    return `- ${compacto(p.iri)}: ${de} → ${p.rango ? compacto(p.rango) : "?"}.${frase(p.comentario)}${valores}`;
  }).join("\n");
  return `Prefijos:\n${prefijos}\n\nClases (instancias en el grafo):\n${cl}\n\nPropiedades (sujeto → objeto):\n${pr}`;
}

export const INSTRUCCIONES = `Traducís preguntas en castellano a una consulta SPARQL 1.1 sobre un grafo RDF chico.
Reglas:
- Contestá SOLO la consulta, en un bloque \`\`\`sparql, sin explicar nada.
- Solo SELECT, ASK o CONSTRUCT. Nunca INSERT, DELETE, LOAD, SERVICE ni FROM.
- Usá solo las clases y propiedades del esquema de abajo. No inventes ninguna.
- Escribí las IRIs con los prefijos de la lista y no escribas las líneas PREFIX: se agregan solas.
- Uní todos los patrones por variables en común (nada de productos cartesianos) y no dejes un ?s ?p ?o suelto.
- Si una propiedad dice sus Valores, escribí el literal igual que ahí, con las mismas mayúsculas.`;

/** Las tres prearmadas que van como ejemplo: una por isla y un property path. "Huecos" es larga y no enseña más. */
export const EJEMPLOS: Prearmada[] = ["acciones-mas-usadas", "tecnologias-mas-pedidas", "acciones-por-proyecto"]
  .map((id) => PREARMADAS.find((p) => p.id === id)!);

export const sinPrefijos = (sparql: string) => sparql.replace(/^\s*PREFIX[^\n]*\n/gim, "").trim();

/** La conversación entera: el sistema con el esquema, los ejemplos como preguntas y respuestas, y la pregunta. */
export function armarMensajes(esquema: Esquema, pregunta: string, ejemplos: Prearmada[] = EJEMPLOS): Mensaje[] {
  return [
    { role: "system", content: `${INSTRUCCIONES}\n\n${textoDelEsquema(esquema)}` },
    ...ejemplos.flatMap((e): Mensaje[] => [
      { role: "user", content: e.pregunta },
      { role: "assistant", content: "```sparql\n" + sinPrefijos(e.sparql) + "\n```" },
    ]),
    { role: "user", content: pregunta.trim() },
  ];
}
