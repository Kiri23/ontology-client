// Tests de aPuestos (vista-neo4j.ts): las filas de la consulta del motor Neo4j → JobPost[], sin red. La vara es
// tests/datos/jobs.json, tres puestos tal como los dio GET /jobs de producción: armadas sus filas al revés (como
// las devuelve el driver, en otro orden y con los valores en listas), tienen que volver idénticas, byte a byte, y en el orden de GET /jobs.

import { assert, assertEquals, assertThrows } from "@std/assert";
import neo4j from "neo4j-driver";
import type { JobPost } from "../mod.ts";
import {
  aPuestos,
  type Fila,
  type Nodo,
  porCodePoint,
  PREFIJOS,
  PuestoQueNoCalza,
  slug,
  texto,
} from "../vista-neo4j.ts";
import { problemas } from "./esquema.ts";

const FIXTURE: JobPost[] = JSON.parse(await Deno.readTextFile(new URL("./datos/jobs.json", import.meta.url)));

// "2026-10-13T21:03:57.000250-04:00" → el DateTime que da el driver por un xsd:dateTime importado por n10s.
function fecha(iso: string) {
  const m = iso.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:([+-])(\d\d):(\d\d))$/);
  if (!m) throw new Error(`fecha de prueba sin forma: ${iso}`);
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const ns = Number((m[7] ?? "").padEnd(9, "0"));
  const offset = (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 3600 + Number(m[10]) * 60);
  return new neo4j.types.DateTime(y, mo, d, h, mi, s, ns, offset);
}

// Una empresa o una fuente como la trae CONSULTA_JOBS: el label en una lista y el sitio como arista.
function nodo(n: { link: string; nombre: string; url?: string }): Nodo {
  return { uri: n.link, rdfs__label: [n.nombre], urls: n.url ? [n.url] : [], urlTexto: null };
}

// Un JobPost como la fila de CONSULTA_JOBS: cada literal en una lista (handleMultival ARRAY), lo que falta en null,
// las aristas en listas (vacías si no hay) y las tecnologías y sinónimos desordenados.
function fila(p: JobPost): Fila {
  const lista = (v: string | undefined) => v === undefined ? null : [v];
  const listaFecha = (v: string | undefined) => v === undefined ? null : [fecha(v)];
  return {
    link: p.link,
    titulo: [p.titulo],
    empresa: p.empresa ? [nodo(p.empresa)] : [],
    empresaTexto: null,
    fuente: [nodo(p.fuente)],
    fuenteTexto: null,
    fecha: [fecha(p.fecha)],
    descartadoEl: listaFecha(p.descartadoEl),
    porque: lista(p.porque),
    aplicadoEl: listaFecha(p.aplicadoEl),
    pide: [...p.pide].reverse().map((t) => ({
      uri: t.link,
      skos__prefLabel: [t.nombre],
      skos__altLabel: t.sinonimos.length ? [...t.sinonimos].reverse() : null,
    })),
  };
}

const PUESTO = FIXTURE[0];
// El fixture no viene en el orden de GET /jobs: es un recorte. Los tres tienen la misma fecha, así que van por titulo.
const ORDENADO = [FIXTURE[0], FIXTURE[2], FIXTURE[1]];

Deno.test("aPuestos: las filas del fixture vuelven idénticas a GET /jobs (orden de claves incluido) y calzan con el contrato", () => {
  const lista = aPuestos([...FIXTURE].reverse().map(fila));
  assertEquals(JSON.stringify(lista), JSON.stringify(ORDENADO));
  assertEquals(problemas(lista), []);
});

Deno.test("aPuestos: los opcionales van solo si están, en el orden de claves de formas.objeto()", () => {
  const decidido = {
    ...PUESTO,
    descartadoEl: "2026-10-15T12:00:00.123456+00:00",
    porque: "pide Java",
    aplicadoEl: "2026-10-15T13:00:00+00:00",
  };
  const [p] = aPuestos([fila(decidido)]);
  assertEquals(Object.keys(p), [
    "link",
    "aplicadoEl",
    "descartadoEl",
    "empresa",
    "fecha",
    "fuente",
    "pide",
    "porque",
    "titulo",
  ]);
  const { empresa: _, ...sinEmpresa } = PUESTO;
  assertEquals("empresa" in aPuestos([fila(sinEmpresa as JobPost)])[0], false);
  assertEquals(problemas([p]), []);
});

Deno.test("aPuestos: orden fecha desc por el instante (no por el texto), después titulo por code point", () => {
  const a = { ...PUESTO, link: "https://x/a", titulo: "B", fecha: "2026-10-13T21:03:57+00:00" };
  const b = { ...PUESTO, link: "https://x/b", titulo: "A", fecha: "2026-10-13T21:03:57+00:00" };
  // 20:00 en -05:00 es 01:00 UTC del 14: más nuevo, aunque como texto vaya antes.
  const c = { ...PUESTO, link: "https://x/c", titulo: "Z", fecha: "2026-10-13T20:00:00-05:00" };
  assertEquals(aPuestos([a, b, c].map(fila)).map((p) => p.link), ["https://x/c", "https://x/b", "https://x/a"]);
});

Deno.test("aPuestos: tecnologia por prefLabel o sinónimo, sin mayúsculas; fuente igual al campo, sin mayúsculas", () => {
  const filas = FIXTURE.map(fila);
  const links = (f: Parameters<typeof aPuestos>[1]) => aPuestos(filas, f).map((p) => p.link);
  assertEquals(links({ tecnologia: "PYTHON" }), [FIXTURE[1].link]);
  assertEquals(links({ tecnologia: "model context protocol" }), [FIXTURE[0].link]);
  assertEquals(links({ tecnologia: "pyth" }), []);
  assertEquals(links({ fuente: "HN" }), [FIXTURE[0].link, FIXTURE[2].link]);
  assertEquals(links({ fuente: " hn " }), [FIXTURE[0].link, FIXTURE[2].link]); // el slug, como fuente_de
  assertEquals(links({ fuente: "h" }), []);
  assertEquals(links({ fuente: "Hacker News" }), []); // compara con el link (…/fuente/hn), no con el nombre
  assertEquals(links({ fuente: "?" }), []);
  // Python: "Straße".casefold() es "strasse", y fuente_de da …/fuente/strasse.
  const strasse = { ...fila(FIXTURE[0]), fuente: [nodo({ link: "https://kiri231.com/fuente/strasse", nombre: "S" })] };
  assertEquals(aPuestos([strasse], { fuente: "STRAẞE" }).map((p) => p.link), [FIXTURE[0].link]);
  assertEquals(links({ tecnologia: "ts", fuente: "remotive" }), [FIXTURE[1].link]);
  assertEquals(links({ tecnologia: "", fuente: "" }), ORDENADO.map((p) => p.link));
});

Deno.test("texto(): un DateTime sale como isoformat() de Python", () => {
  assertEquals(texto(fecha("2026-10-13T21:03:57+00:00")), "2026-10-13T21:03:57+00:00");
  assertEquals(texto(fecha("2026-10-15T12:00:00.000250-04:00")), "2026-10-15T12:00:00.000250-04:00");
  assertEquals(texto(fecha("2026-10-15T12:00:00.5+05:30")), "2026-10-15T12:00:00.500000+05:30");
  assertEquals(texto(new neo4j.types.LocalDateTime(2026, 1, 2, 3, 4, 5, 0)), "2026-01-02T03:04:05");
  assertEquals(texto("hn"), "hn");
});

Deno.test("aPuestos: lo que no calza con JobPost tira PuestoQueNoCalza, como el 503 del servidor", () => {
  const base = fila(PUESTO);
  const casos: [Partial<Fila>, string][] = [
    [{ titulo: ["uno", "otro"] }, "tiene 2 titulo"],
    [{ fecha: null }, "no tiene fecha"],
    [{ fuente: [] }, "no tiene fuente"],
    [{
      empresa: [
        nodo({ link: "https://kiri231.com/empresa/a", nombre: "A" }),
        nodo({ link: "https://kiri231.com/empresa/b", nombre: "B" }),
      ],
    }, "tiene 2 empresa"],
    // La vista cargada de un servidor de antes de ontologyLearning #50: n10s deja el literal como propiedad.
    [{ empresaTexto: ["Lemon.io"] }, "su empresa es texto"],
    [{ fuente: [], fuenteTexto: ["hn"] }, "su fuente es texto"],
    [{ fuente: [{ ...nodo(PUESTO.fuente), rdfs__label: null }] }, "no tiene nombre (rdfs:label)"],
    [{ fuente: [{ ...nodo(PUESTO.fuente), rdfs__label: ["Hacker News", "HN"] }] }, "tiene 2 nombre"],
    [{ fuente: [{ ...nodo(PUESTO.fuente), urls: ["https://a.dev", "https://b.dev"] }] }, "tiene 2 url"],
    [{ fuente: [{ ...nodo(PUESTO.fuente), urls: [], urlTexto: ["https://a.dev"] }] }, "es texto, no una IRI"],
    [
      { pide: [{ uri: "https://kiri231.com/tecnologia/X", skos__prefLabel: null, skos__altLabel: null }] },
      "no tiene nombre",
    ],
    [{ fecha: ["ayer"] }, "no es un xsd:dateTime"],
  ];
  for (const [cambio, mensaje] of casos) {
    assertThrows(() => aPuestos([{ ...base, ...cambio }]), PuestoQueNoCalza, mensaje);
  }
});

Deno.test("porCodePoint: compara como Python, no por unidades UTF-16", () => {
  const astral = "\u{1F600}", alto = "｡"; // U+1F600 > U+FF61, pero su primera unidad UTF-16 (D83D) es menor
  assert(astral < alto, "JS a secas ordena distinto: si no, este test no prueba nada");
  assert(porCodePoint(astral, alto) > 0);
  assertEquals(["b", "a", "ab", ""].sort(porCodePoint), ["", "a", "ab", "b"]);
});

Deno.test("aPuestos: tecnologia filtra antes de armar el puesto, como jobs.rq: uno que no calza y no pide eso no tira", () => {
  const malo = { ...fila(FIXTURE[0]), titulo: ["uno", "otro"] }; // pide MCP, no Python
  assertEquals(aPuestos([malo, fila(FIXTURE[1])], { tecnologia: "python" }).map((p) => p.link), [FIXTURE[1].link]);
  assertThrows(() => aPuestos([malo, fila(FIXTURE[1])], { tecnologia: "mcp" }), PuestoQueNoCalza, "tiene 2 titulo");
  // fuente filtra después, como jobs_get.py: el puesto malo tira aunque sea de otra fuente.
  assertThrows(() => aPuestos([malo, fila(FIXTURE[1])], { fuente: "remotive" }), PuestoQueNoCalza, "tiene 2 titulo");
});

Deno.test("PREFIJOS: un prefijo por namespace (n10s.nsprefixes.add no acepta un segundo para el mismo)", () => {
  const repetidos = Object.entries(PREFIJOS).filter(([p, ns], _, todos) => todos.some(([q, m]) => q !== p && m === ns));
  assertEquals(repetidos, []);
});

Deno.test("slug(): el de core/jobs.py (los valores salen de correrlo en la rama de ontologyLearning #50)", () => {
  assertEquals(slug("HN"), "hn");
  assertEquals(slug(" hn "), "hn");
  assertEquals(slug("Typify.dev"), "typify-dev");
  assertEquals(slug("Ñandú Café"), "nandu-cafe");
  assertEquals(slug("a".repeat(100)), "a".repeat(80));
  assertEquals(slug("株式会社"), ""); // allá sin-nombre-a8bb7f5d22: ninguna fuente se llama así
});
