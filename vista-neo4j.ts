// vista-neo4j.ts — el contrato de la vista Neo4j: cómo la arma n10s (CONFIG_N10S, PREFIJOS), qué le pregunta el
// motor (CONSULTA_JOBS) y cómo las filas vuelven a ser JobPost[] idénticos a los de GET /jobs (aPuestos). Lo usan
// neo4j.ts (el motor) y scripts/neo4j-cargar.ts (la carga): si cambia la config, cambian los dos juntos.
//
// aPuestos reproduce lo que hace el servidor (comandos/jobs_get.py, consultas/jobs.rq y core/formas.py de
// ontologyLearning), sin red, así se prueba con filas armadas a mano:
//   campos      link, después los de ontologia:JobPostShape por nombre; un campo opcional ausente no va (nada de null)
//   pide        ordenados por link, y los sinonimos de cada uno por texto: sorted(set(...), key=str) en formas.py
//   fechas      el xsd:dateTime como lo escribe Python (isoformat): 2026-10-13T21:03:57+00:00, con microsegundos
//               solo si no son cero
//   orden       fecha desc (el instante), después titulo; texto comparado por code point, como Python
//   tecnologia  prefLabel o altLabel de algo que pide, sin mayúsculas (LCASE en jobs.rq), antes de armar el puesto
//   empresa     un nodo (schema:Organization), no texto: { link, nombre, url? }, con su rdfs:label y su schema:url
//   fuente      también un nodo (schema:WebSite), y el filtro compara su link con https://kiri231.com/fuente/<slug>,
//               el slug del filtro sin mayúsculas (fuente_de y slug en core/jobs.py; casefold allá, toLowerCase acá).
//               Un filtro sin letras ni dígitos no da ningún puesto: allá su slug es sin-nombre-<sha1>, que ninguna
//               fuente de kiri-jobs (hn, remotive, desconocida) tiene
//   forma       un puesto con dos titulos, sin fecha, una tecnología sin nombre o una empresa que es texto (datos
//               de antes de ontologyLearning #50) no calza: el servidor responde 503 y acá tira PuestoQueNoCalza

import neo4j from "neo4j-driver";
import type { FiltrosJobs, JobPost, Organization, Technology, WebSite } from "./jobs.ts";

/**
 * La config de n10s.graphconfig.init: IRIs acortadas con prefijo (ontologia__JobPost, rdfs__label), cada literal como
 * lista (handleMultival ARRAY: ningún valor se pisa, el motor chequea la cardinalidad como la forma), rdf:type
 * como label, sin lang tags. Los xsd van a tipos de Neo4j: xsd:dateTime → DateTime.
 */
export const CONFIG_N10S = {
  handleVocabUris: "SHORTEN",
  handleMultival: "ARRAY",
  handleRDFTypes: "LABELS",
  keepLangTag: false,
  keepCustomDataTypes: false,
  applyNeo4jNaming: false,
} as const;

/**
 * Los prefijos de la vista, uno por namespace de clase o predicado de los datos: los que nombra CONSULTA_JOBS
 * (ontologia, rdfs, skos, dct, prov) y los del resto (doap, rdf, schema). Van antes de importar nada, así ningún
 * namespace queda como nsN. Uno nuevo en los datos que no esté acá sí quedaría nsN: se suma acá. Un namespace lleva
 * un solo prefijo: n10s.nsprefixes.add no acepta un segundo para el mismo. Los de instancias (tecnologia/, empresa/,
 * fuente/) no van: n10s acorta clases y predicados, y una instancia queda con su uri entera.
 */
export const PREFIJOS: Readonly<Record<string, string>> = {
  ontologia: "https://kiri231.com/ontologia#",
  schema: "https://schema.org/",
  doap: "http://usefulinc.com/ns/doap#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dct: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
};

/**
 * El nodo que deja scripts/neo4j-cargar.ts al final de una carga completa. La carga lo borra antes que nada, así una
 * carga que se cortó a la mitad (la fuente se cayó, un import falló) deja la vista sin él, y el motor no la lee.
 */
export const CENTINELA = "_Carga";

/**
 * Una sola fila: `cargas`, cuántos centinelas de carga completa hay (0: la vista está vacía o a medias), `prefijos`, los
 * que n10s guardó al cargarla (su nodo _NsPrefDef: {prefijo: namespace}, ver prefijosQueFaltan), y `filas`,
 * cada JobPost con título (jobs.rq pide rdfs:label) y lo que pide, con los campos como listas. Va todo en una
 * consulta para que el chequeo del centinela no cueste otro viaje.
 *
 * Un triple con una IRI de objeto es una arista: la empresa (ontologia__empresa), la fuente (dct__source), lo que pide
 * (ontologia__pide) y el sitio de una empresa o una fuente (schema__url) salen por patrón, cada uno su lista. Si en vez
 * de IRI el dato es un literal, n10s lo deja como propiedad: empresaTexto, fuenteTexto y urlTexto lo traen para que no
 * se pierda callado (es la vista cargada de un servidor de antes: no calza).
 */
export const CONSULTA_JOBS = `
OPTIONAL MATCH (c:${CENTINELA} {completa: true})
WITH count(c) AS cargas
OPTIONAL MATCH (ns:_NsPrefDef)
WITH cargas, properties(ns) AS prefijos
OPTIONAL MATCH (p:ontologia__JobPost) WHERE cargas > 0 AND p.rdfs__label IS NOT NULL
RETURN cargas, prefijos, collect(CASE WHEN p IS NULL THEN null ELSE {
  link: p.uri, titulo: p.rdfs__label, fecha: p.prov__generatedAtTime, descartadoEl: p.ontologia__descartadoEl,
  porque: p.ontologia__porque, aplicadoEl: p.ontologia__aplicadoEl,
  empresa: [(p)-[:ontologia__empresa]->(e) | e { .uri, .rdfs__label, urls: [(e)-[:schema__url]->(u) | u.uri],
    urlTexto: e.schema__url }],
  empresaTexto: p.ontologia__empresa,
  fuente: [(p)-[:dct__source]->(f) | f { .uri, .rdfs__label, urls: [(f)-[:schema__url]->(u) | u.uri],
    urlTexto: f.schema__url }],
  fuenteTexto: p.dct__source,
  pide: [(p)-[:ontologia__pide]->(t) | t { .uri, .skos__prefLabel, .skos__altLabel }] } END) AS filas`;

/**
 * Los PREFIJOS que la vista no tiene, o tiene con otro namespace: `ontologia (https://kiri231.com/ontologia#)`. Los
 * labels y las relaciones salen de los prefijos (ontologia__JobPost), así que una vista cargada con otros (la del
 * 2026-10-15: j__JobPost, de kiri23.dev) no tiene ningún puesto con el nombre que pregunta CONSULTA_JOBS, y
 * respondería [] callada. motorNeo4j la rechaza antes de leer filas.
 */
export function prefijosQueFaltan(vista: Readonly<Record<string, unknown>> | null | undefined): string[] {
  return Object.entries(PREFIJOS).filter(([prefijo, ns]) => vista?.[prefijo] !== ns).map(([p, ns]) => `${p} (${ns})`);
}

/** Un valor de propiedad como lo devuelve el driver con handleMultival ARRAY: una lista, o null si no está. */
type Valores = readonly unknown[] | null | undefined;

/** Una empresa o una fuente de una fila: el nodo, su rdfs:label y su schema:url (aristas, o literal si no es IRI). */
export interface Nodo {
  uri: string;
  rdfs__label: Valores;
  urls: readonly string[];
  urlTexto: Valores;
}

/** Un puesto de `filas` de CONSULTA_JOBS. */
export interface Fila {
  link: string;
  titulo: Valores;
  empresa: readonly Nodo[];
  empresaTexto: Valores;
  fuente: readonly Nodo[];
  fuenteTexto: Valores;
  fecha: Valores;
  descartadoEl: Valores;
  porque: Valores;
  aplicadoEl: Valores;
  pide: readonly { uri: string; skos__prefLabel: Valores; skos__altLabel: Valores }[];
}

/** Un puesto de la vista que no tiene la forma JobPost: el servidor, con el mismo dato, responde 503. */
export class PuestoQueNoCalza extends Error {
  override name: string = "PuestoQueNoCalza";
}

/**
 * Las filas de CONSULTA_JOBS como las devuelve GET /jobs con esos filtros: forma, filtros y orden. Los filtros van
 * donde los aplica el servidor: tecnologia sobre el dato crudo, antes de armar el puesto (en jobs.rq, antes de
 * formas.objeto), y fuente sobre el puesto ya armado (jobs_get.py). Así un puesto que no calza tira acá cuando tira
 * allá: si el filtro tecnologia lo deja afuera, no.
 */
export function aPuestos(filas: readonly Fila[], filtros: FiltrosJobs = {}): JobPost[] {
  const tecnologia = filtros.tecnologia?.toLowerCase();
  const fuente = filtros.fuente ? FUENTE + slug(filtros.fuente.toLowerCase()) : undefined;
  return filas
    .filter((f) => !tecnologia || pide(f, tecnologia))
    .map((f) => ({ puesto: puesto(f), instante: instante(uno(f, "fecha", f.fecha)) }))
    .filter(({ puesto }) => !fuente || puesto.fuente.link === fuente)
    .sort((a, b) => compararInstantes(b.instante, a.instante) || porCodePoint(a.puesto.titulo, b.puesto.titulo))
    .map(({ puesto }) => puesto);
}

// Un JobPost con las claves en el orden de formas.objeto(): link y después los campos por nombre.
function puesto(f: Fila): JobPost {
  const opcional = (nombre: string, valores: Valores) => {
    const v = aLoSumoUno(f.link, nombre, valores);
    return v === undefined ? {} : { [nombre]: texto(v) };
  };
  return {
    link: f.link,
    ...opcional("aplicadoEl", f.aplicadoEl),
    ...opcional("descartadoEl", f.descartadoEl),
    ...empresa(f),
    fecha: texto(uno(f, "fecha", f.fecha)),
    fuente: fuente(f),
    pide: [...f.pide].sort((a, b) => porCodePoint(a.uri, b.uri)).map((t) => tecnologia(f.link, t)),
    ...opcional("porque", f.porque),
    titulo: texto(uno(f, "titulo", f.titulo)),
  } as JobPost;
}

/** El nodo de las fuentes: https://kiri231.com/fuente/hn (FUENTE en core/jobs.py). */
export const FUENTE = "https://kiri231.com/fuente/";

/**
 * slug() de core/jobs.py: sin acentos (NFKD y fuera lo que no es ASCII), minúsculas, guiones, a lo sumo 80. Lo que
 * allá queda vacío y lleva sha1 (sin-nombre-…) acá queda vacío: solo se usa para comparar con una fuente que existe.
 */
export function slug(nombre: string): string {
  const latino = nombre.normalize("NFKD").replace(/[\u0080-\uffff]/g, "");
  return latino.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/^-+|-+$/g, "");
}

// La empresa, si hay: a lo sumo una, y un nodo. Un literal (la empresa como texto, de antes) no calza.
function empresa(f: Fila): { empresa?: Organization } {
  if (f.empresaTexto?.length) throw new PuestoQueNoCalza(`${f.link}: su empresa es texto, no un nodo`);
  const n = aLoSumoUnNodo(f.link, "empresa", f.empresa);
  return n === undefined ? {} : { empresa: nodo(n) };
}

// La fuente: exactamente una, y un nodo.
function fuente(f: Fila): WebSite {
  if (f.fuenteTexto?.length) throw new PuestoQueNoCalza(`${f.link}: su fuente es texto, no un nodo`);
  const n = aLoSumoUnNodo(f.link, "fuente", f.fuente);
  if (n === undefined) throw new PuestoQueNoCalza(`${f.link} no tiene fuente, que la forma JobPost pide`);
  return nodo(n);
}

function aLoSumoUnNodo(link: string, nombre: string, nodos: readonly Nodo[]): Nodo | undefined {
  const distintos = new Set(nodos.map((n) => n.uri));
  if (distintos.size > 1) {
    throw new PuestoQueNoCalza(`${link} tiene ${distintos.size} ${nombre}; la forma JobPost pide uno`);
  }
  return nodos[0];
}

// Un Organization o un WebSite, en el orden de formas.objeto(): link, nombre, url (si hay, y una IRI).
function nodo(n: Nodo): Organization & WebSite {
  const nombre = aLoSumoUno(n.uri, "nombre", n.rdfs__label);
  if (nombre === undefined) throw new PuestoQueNoCalza(`${n.uri} no tiene nombre (rdfs:label)`);
  if (n.urlTexto?.length) throw new PuestoQueNoCalza(`${n.uri}: su url (schema:url) es texto, no una IRI`);
  const url = aLoSumoUno(n.uri, "url", n.urls);
  return { link: n.uri, nombre: texto(nombre), ...(url === undefined ? {} : { url: texto(url) }) };
}

function tecnologia(link: string, t: Fila["pide"][number]): Technology {
  const nombre = aLoSumoUno(t.uri, "nombre", t.skos__prefLabel);
  if (nombre === undefined) throw new PuestoQueNoCalza(`${link} pide ${t.uri}, que no tiene nombre (skos:prefLabel)`);
  return {
    link: t.uri,
    nombre: texto(nombre),
    sinonimos: [...new Set((t.skos__altLabel ?? []).map(texto))].sort(porCodePoint),
  };
}

// Si la fila pide algo con ese prefLabel o altLabel, sin mayúsculas (LCASE en jobs.rq): el filtro tecnologia.
function pide(f: Fila, tecnologia: string): boolean {
  return f.pide.some((t) =>
    [...(t.skos__prefLabel ?? []), ...(t.skos__altLabel ?? [])].some((n) => texto(n).toLowerCase() === tecnologia)
  );
}

function uno(f: Fila, nombre: string, valores: Valores): unknown {
  const v = aLoSumoUno(f.link, nombre, valores);
  if (v === undefined) throw new PuestoQueNoCalza(`${f.link} no tiene ${nombre}, que la forma JobPost pide`);
  return v;
}

function aLoSumoUno(quien: string, nombre: string, valores: Valores): unknown {
  const distintos = new Set((valores ?? []).map(texto));
  if (distintos.size > 1) {
    throw new PuestoQueNoCalza(`${quien} tiene ${distintos.size} ${nombre}; la forma JobPost pide uno`);
  }
  return valores?.[0] ?? undefined;
}

/** Un literal de Neo4j como texto JSON: un DateTime como su lexical de Python, lo demás tal cual. */
export function texto(v: unknown): string {
  if (neo4j.isDateTime(v) || neo4j.isLocalDateTime(v)) return isoformat(v);
  return String(v);
}

type Fecha = {
  year: unknown;
  month: unknown;
  day: unknown;
  hour: unknown;
  minute: unknown;
  second: unknown;
  nanosecond: unknown;
};

// datetime.isoformat() de Python: microsegundos solo si no son cero; el offset como ±HH:MM (y :SS si los hay).
function isoformat(v: Fecha & { timeZoneOffsetSeconds?: unknown }): string {
  const n = (x: unknown) => Number(x);
  const d2 = (x: unknown) => String(n(x)).padStart(2, "0");
  const micro = Math.floor(n(v.nanosecond) / 1000);
  const fraccion = micro ? `.${String(micro).padStart(6, "0")}` : "";
  const base = `${String(n(v.year)).padStart(4, "0")}-${d2(v.month)}-${d2(v.day)}T${d2(v.hour)}:${d2(v.minute)}:${
    d2(v.second)
  }${fraccion}`;
  return v.timeZoneOffsetSeconds === undefined ? base : base + offset(n(v.timeZoneOffsetSeconds));
}

function offset(segundos: number): string {
  const signo = segundos < 0 ? "-" : "+";
  const s = Math.abs(segundos);
  const d2 = (x: number) => String(x).padStart(2, "0");
  return `${signo}${d2(Math.floor(s / 3600))}:${d2(Math.floor(s % 3600 / 60))}${s % 60 ? `:${d2(s % 60)}` : ""}`;
}

// El instante de una fecha en nanosegundos desde 1970, para ordenar como rdflib (por el instante, no el texto).
// Sin zona (LocalDateTime) cuenta como UTC.
function instante(v: unknown): bigint {
  if (!(neo4j.isDateTime(v) || neo4j.isLocalDateTime(v))) {
    throw new PuestoQueNoCalza(`fecha ${String(v)} no es un xsd:dateTime`);
  }
  const f = v as Fecha & { timeZoneOffsetSeconds?: unknown };
  const n = (x: unknown) => Number(x);
  const ms = Date.UTC(n(f.year), n(f.month) - 1, n(f.day), n(f.hour), n(f.minute), n(f.second)) -
    n(f.timeZoneOffsetSeconds ?? 0) * 1000;
  return BigInt(ms) * 1_000_000n + BigInt(n(f.nanosecond));
}

function compararInstantes(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compara texto por code point, como Python (JS compara unidades UTF-16: difiere fuera del plano básico). */
export function porCodePoint(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}
