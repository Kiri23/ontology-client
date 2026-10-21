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
//   fuente      igual al campo fuente, sin mayúsculas (casefold en jobs_get.py; acá toLowerCase)
//   forma       un puesto con dos titulos, sin fecha, o una tecnología sin nombre no calza: el servidor
//               responde 503 y acá tira PuestoQueNoCalza

import neo4j from "neo4j-driver";
import type { FiltrosJobs, JobPost, Technology } from "./jobs.ts";

/**
 * La config de n10s.graphconfig.init: IRIs acortadas con prefijo (j__JobPost, rdfs__label), cada literal como
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
 * Los prefijos de la vista: los que nombra CONSULTA_JOBS (j, t, rdfs, skos, dct, prov) y los del resto de los datos
 * (k, doap, rdf). Van antes de importar nada, así ningún namespace queda como nsN. Uno nuevo en los datos que no
 * esté acá sí quedaría nsN: se suma acá.
 */
export const PREFIJOS: Readonly<Record<string, string>> = {
  j: "https://kiri231.com/ontologia#",
  t: "https://kiri231.com/tecnologia/",
  k: "https://kiri231.com/ontologia#",
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
 * Una sola fila: `cargas`, cuántos centinelas de carga completa hay (0: la vista está vacía o a medias), y `filas`,
 * cada JobPost con título (jobs.rq pide rdfs:label) y lo que pide, con los campos como listas. Va todo en una
 * consulta para que el chequeo del centinela no cueste otro viaje.
 */
export const CONSULTA_JOBS = `
OPTIONAL MATCH (c:${CENTINELA} {completa: true})
WITH count(c) AS cargas
OPTIONAL MATCH (p:j__JobPost) WHERE cargas > 0 AND p.rdfs__label IS NOT NULL
OPTIONAL MATCH (p)-[:j__pide]->(tecnologia:Resource)
WITH cargas, p, collect(t { .uri, .skos__prefLabel, .skos__altLabel }) AS pide
RETURN cargas, collect(CASE WHEN p IS NULL THEN null ELSE {
  link: p.uri, titulo: p.rdfs__label, empresa: p.j__empresa, fuente: p.dct__source,
  fecha: p.prov__generatedAtTime, descartadoEl: p.j__descartadoEl, porque: p.j__porque,
  aplicadoEl: p.j__aplicadoEl, pide: pide } END) AS filas`;

/** Un valor de propiedad como lo devuelve el driver con handleMultival ARRAY: una lista, o null si no está. */
type Valores = readonly unknown[] | null | undefined;

/** Un puesto de `filas` de CONSULTA_JOBS. */
export interface Fila {
  link: string;
  titulo: Valores;
  empresa: Valores;
  fuente: Valores;
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
  const fuente = filtros.fuente?.toLowerCase();
  return filas
    .filter((f) => !tecnologia || pide(f, tecnologia))
    .map((f) => ({ puesto: puesto(f), instante: instante(uno(f, "fecha", f.fecha)) }))
    .filter(({ puesto }) => !fuente || puesto.fuente.toLowerCase() === fuente)
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
    ...opcional("empresa", f.empresa),
    fecha: texto(uno(f, "fecha", f.fecha)),
    fuente: texto(uno(f, "fuente", f.fuente)),
    pide: [...f.pide].sort((a, b) => porCodePoint(a.uri, b.uri)).map((t) => tecnologia(f.link, t)),
    ...opcional("porque", f.porque),
    titulo: texto(uno(f, "titulo", f.titulo)),
  } as JobPost;
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
