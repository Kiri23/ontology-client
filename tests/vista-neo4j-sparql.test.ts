// La vista contra datos reales del servidor, sin Neo4j: tests/datos/vista-neo4j.ttl es lo que el CONSTRUCT de
// scripts/neo4j-cargar.ts trae del /sparql de ontologyLearning #50 (empresa y fuente como nodos), y vista-neo4j.json
// es GET /jobs de ese mismo servidor para esos puestos. filas() hace con los triples lo que n10s (CONFIG_N10S) y
// CONSULTA_JOBS hacen juntos: un literal es una propiedad en lista, una IRI es una arista. Lo que filas() lee lo tiene
// que leer también la consulta, con el nombre que le da PREFIJOS y como lo que es (`.rdfs__label` una propiedad,
// `[:ontologia__pide]` una arista, `:ontologia__JobPost` un label): eso lo revisa el primer test.

import { assertEquals } from "@std/assert";
import neo4j from "neo4j-driver";
import { type NamedNode, Parser, type Quad } from "n3";
import type { JobPost } from "../mod.ts";
import { aPuestos, CONSULTA_JOBS, type Fila, type Nodo, PREFIJOS } from "../vista-neo4j.ts";
import { problemas } from "./esquema.ts";

const TRIPLES: Quad[] = new Parser().parse(
  await Deno.readTextFile(new URL("./datos/vista-neo4j.ttl", import.meta.url)),
);
const GET_JOBS: JobPost[] = JSON.parse(await Deno.readTextFile(new URL("./datos/vista-neo4j.json", import.meta.url)));

const ONTOLOGIA = PREFIJOS.ontologia, RDFS = PREFIJOS.rdfs, SKOS = PREFIJOS.skos, SCHEMA = PREFIJOS.schema;
const RDF_TYPE = PREFIJOS.rdf + "type";
const SOURCE = PREFIJOS.dct + "source", FECHA = PREFIJOS.prov + "generatedAtTime";

// Lo que filas() lee, como lo escribe Cypher con los nombres de n10s: `.rdfs__label`, `[:ontologia__empresa]`.
const LEIDOS = new Set<string>();

// Una IRI de clase o de predicado acortada como SHORTEN con PREFIJOS; undefined si quedaría nsN.
function corto(iri: string): string | undefined {
  const [prefijo, ns] = Object.entries(PREFIJOS).find(([, ns]) => iri.startsWith(ns)) ?? [];
  return prefijo && ns && `${prefijo}__${iri.slice(ns.length)}`;
}

function objetos(s: string, p: string): Quad["object"][] {
  return TRIPLES.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object);
}

// Una propiedad de n10s (handleMultival ARRAY): los literales en una lista, o null si no hay ninguno.
function propiedad(s: string, p: string, valor: (texto: string) => unknown = (t) => t): unknown[] | null {
  LEIDOS.add(`.${corto(p)}`);
  const literales = objetos(s, p).filter((o) => o.termType === "Literal");
  return literales.length ? literales.map((o) => valor(o.value)) : null;
}

// Las aristas: las IRIs de objeto, como las junta un patrón [(s)-[:p]->(o) | o.uri].
function aristas(s: string, p: string): string[] {
  LEIDOS.add(`[:${corto(p)}]`);
  return objetos(s, p).filter((o): o is NamedNode => o.termType === "NamedNode").map((o) => o.value);
}

// Un xsd:dateTime como lo importa n10s: un DateTime de Neo4j con su offset.
function fecha(iso: string) {
  const m = iso.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?([+-])(\d\d):(\d\d)$/);
  if (!m) throw new Error(`fecha del fixture sin forma: ${iso}`);
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const offset = (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 3600 + Number(m[10]) * 60);
  return new neo4j.types.DateTime(y, mo, d, h, mi, s, Number((m[7] ?? "").padEnd(9, "0")), offset);
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nodo(uri: string): Nodo {
  const url = SCHEMA + "url";
  return { uri, rdfs__label: propiedad(uri, RDFS + "label"), urls: aristas(uri, url), urlTexto: propiedad(uri, url) };
}

// Lo que devuelve CONSULTA_JOBS para estos triples cargados con n10s.
function filas(): Fila[] {
  const puestos = TRIPLES.filter((q) => q.predicate.value === RDF_TYPE && q.object.value === ONTOLOGIA + "JobPost")
    .map((q) => q.subject.value);
  LEIDOS.add(`:${corto(ONTOLOGIA + "JobPost")}`);
  return puestos.map((link) => ({
    link,
    titulo: propiedad(link, RDFS + "label"),
    fecha: propiedad(link, FECHA, fecha),
    descartadoEl: propiedad(link, ONTOLOGIA + "descartadoEl", fecha),
    porque: propiedad(link, ONTOLOGIA + "porque"),
    aplicadoEl: propiedad(link, ONTOLOGIA + "aplicadoEl", fecha),
    empresa: aristas(link, ONTOLOGIA + "empresa").map(nodo),
    empresaTexto: propiedad(link, ONTOLOGIA + "empresa"),
    fuente: aristas(link, SOURCE).map(nodo),
    fuenteTexto: propiedad(link, SOURCE),
    pide: aristas(link, ONTOLOGIA + "pide").map((uri) => ({
      uri,
      skos__prefLabel: propiedad(uri, SKOS + "prefLabel"),
      skos__altLabel: propiedad(uri, SKOS + "altLabel"),
    })),
  }));
}

Deno.test("vista: cada clase y predicado del /sparql tiene prefijo, y lo que lee la vista está en CONSULTA_JOBS", () => {
  const vocabulario = new Set(
    TRIPLES.flatMap((q) => q.predicate.value === RDF_TYPE ? [q.object.value] : [q.predicate.value]),
  );
  assertEquals([...vocabulario].filter((iri) => corto(iri) === undefined), []);
  filas();
  const cypher = CONSULTA_JOBS.replace(/\s+/g, " ");
  assertEquals([...LEIDOS].filter((nombre) => !new RegExp(`${escapar(nombre)}(?!\\w)`).test(cypher)), []);
});

Deno.test("vista: los triples del /sparql de #50 vuelven a ser GET /jobs de ese servidor, byte a byte", () => {
  const lista = aPuestos(filas().reverse());
  assertEquals(JSON.stringify(lista), JSON.stringify(GET_JOBS));
  assertEquals(problemas(lista), []);
});

Deno.test("vista: el filtro fuente compara con el link de la fuente, como GET /jobs?fuente= de #50", () => {
  const links = (fuente: string) => aPuestos(filas(), { fuente }).map((p) => p.link);
  const de = (f: string) =>
    GET_JOBS.filter((p) => p.fuente.link === `https://kiri231.com/fuente/${f}`).map((p) => p.link);
  assertEquals(links("HN"), de("hn"));
  assertEquals(links("remotive"), de("remotive"));
  assertEquals(de("hn").length, 2); // si el fixture perdiera una fuente, este test no probaría nada
  assertEquals(de("remotive").length, 2);
  assertEquals(links("Hacker News"), []);
});
