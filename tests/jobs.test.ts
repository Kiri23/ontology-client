// Tests de jobs.get() con un fetch falso que responde tests/datos/jobs.json (tres puestos tal como los dio
// producción el 2026-10-13). No tocan la red, salvo el último: con ONTOLOGY_PRODUCCION=1 llama a producción.
//
// La forma se chequea contra el schema del contrato (contrato/openapi.json), no contra una lista de campos
// escrita acá: si el servidor cambia JobPost, este chequeo cambia con él.

import { assert, assertEquals, assertInstanceOf, assertRejects, assertStringIncludes } from "@std/assert";
import { ErrorServidor, jobs } from "../mod.ts";
import { servidorMudo } from "./servidor-mudo.ts";

const FIXTURE = await Deno.readTextFile(new URL("./datos/jobs.json", import.meta.url));

interface Schema {
  type?: string;
  $ref?: string;
  format?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
}

const contrato = JSON.parse(await Deno.readTextFile(new URL("../contrato/openapi.json", import.meta.url)));
const SCHEMAS: Record<string, Schema> = contrato.components.schemas;
const RESPUESTA_200: Schema = contrato.paths["/jobs"].get.responses["200"].content["application/json"].schema;

// Lo que no calza de `valor` respecto de `s`, cada cosa con su ruta ($[0].pide[1].nombre: falta). [] si calza.
function problemas(valor: unknown, s: Schema, ruta = "$"): string[] {
  if (s.$ref) return problemas(valor, SCHEMAS[s.$ref.split("/").pop()!], ruta);
  if (s.type === "string") {
    if (typeof valor !== "string") return [`${ruta}: no es string`];
    if (s.format === "date-time" && Number.isNaN(Date.parse(valor))) return [`${ruta}: no es date-time`];
    if (s.format === "uri" && !URL.canParse(valor)) return [`${ruta}: no es uri`];
    return [];
  }
  if (s.type === "array") {
    if (!Array.isArray(valor)) return [`${ruta}: no es lista`];
    return valor.flatMap((v, i) => problemas(v, s.items!, `${ruta}[${i}]`));
  }
  if (s.type === "object") {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return [`${ruta}: no es objeto`];
    const o = valor as Record<string, unknown>;
    const propiedades = s.properties ?? {};
    const faltan = (s.required ?? []).filter((k) => !(k in o)).map((k) => `${ruta}.${k}: falta`);
    const sobran = s.additionalProperties === false
      ? Object.keys(o).filter((k) => !(k in propiedades)).map((k) => `${ruta}.${k}: no está en el schema`)
      : [];
    const campos = Object.entries(o).flatMap(([k, v]) =>
      propiedades[k] ? problemas(v, propiedades[k], `${ruta}.${k}`) : []
    );
    return [...faltan, ...sobran, ...campos];
  }
  throw new Error(`${ruta}: este chequeo no conoce el schema ${JSON.stringify(s)}`);
}

// Un fetch que guarda el último pedido y responde con `respuesta`.
function grabador(respuesta: () => Response) {
  const visto: { pedido?: Request } = {};
  const fetch = (pedido: Request) => {
    visto.pedido = pedido;
    return Promise.resolve(respuesta());
  };
  return { fetch, visto };
}

const fixture = () => new Response(FIXTURE, { headers: { "Content-Type": "application/json" } });

Deno.test("el chequeo de forma muerde: un JobPost sin titulo o con un campo de más no pasa", () => {
  const [puesto] = JSON.parse(FIXTURE);
  const { titulo: _, ...sinTitulo } = puesto;
  assertEquals(problemas([sinTitulo], RESPUESTA_200), ["$[0].titulo: falta"]);
  assertEquals(problemas([{ ...puesto, salario: 1 }], RESPUESTA_200), ["$[0].salario: no está en el schema"]);
  const pideRoto = { ...puesto, pide: [{ link: "https://kiri23.dev/tech#X", sinonimos: [] }] };
  assertEquals(problemas([pideRoto], RESPUESTA_200), ["$[0].pide[0].nombre: falta"]);
});

Deno.test("jobs.get(): GET /jobs sin token, y la lista calza con el schema JobPost[] del contrato", async () => {
  const { fetch, visto } = grabador(fixture);
  const lista = await jobs.get({}, { url: "http://falso", fetch });
  assertEquals(visto.pedido?.method, "GET");
  assertEquals(visto.pedido?.url, "http://falso/jobs");
  assertEquals(visto.pedido?.headers.get("Authorization"), null);
  assertEquals(lista.length, 3);
  assertEquals(problemas(lista, RESPUESTA_200), []);
  assertEquals(lista[1].pide.map((t) => t.nombre), ["C#", "Node.js", "Python", "React", "TypeScript"]);
});

Deno.test("jobs.get(filtros): tecnologia y fuente van en la query", async () => {
  const { fetch, visto } = grabador(fixture);
  await jobs.get({ tecnologia: "python", fuente: "hn" }, { url: "http://falso", fetch });
  assertEquals(visto.pedido?.url, "http://falso/jobs?tecnologia=python&fuente=hn");
});

Deno.test("jobs.get(): sin url va a producción", async () => {
  const { fetch, visto } = grabador(fixture);
  await jobs.get(undefined, { fetch });
  assertEquals(visto.pedido?.url, "https://ontology.kiri231.com/jobs");
});

Deno.test("503: ErrorServidor con el status y el mensaje del servidor, no una lista", async () => {
  const mensaje = "datos/jobs.trig es de una forma vieja: POST /jobs?kiri_jobs=--all lo rehace";
  const { fetch } = grabador(() => Response.json({ error: mensaje }, { status: 503 }));
  const e = await assertRejects(() => jobs.get({}, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals(e.status, 503);
  assertEquals(e.message, `GET /jobs: ${mensaje}`);
  assertEquals(e.name, "ErrorServidor");
});

Deno.test("400: ErrorServidor con el {error} del servidor", async () => {
  const { fetch } = grabador(() => Response.json({ error: "tecnologia vacía" }, { status: 400 }));
  const e = await assertRejects(() => jobs.get({}, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals([e.status, e.message], [400, "GET /jobs: tecnologia vacía"]);
});

Deno.test("200 que no es lista: fuera del contrato, con su status", async () => {
  const { fetch } = grabador(() => Response.json({ jobs: [] }));
  const e = await assertRejects(() => jobs.get({}, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals(e.status, 200);
  assertStringIncludes(e.message, "no es una lista de JobPost");
});

Deno.test("200 que no es JSON: fuera del contrato, con su status", async () => {
  const { fetch } = grabador(() => new Response("<html>hola</html>", { status: 200 }));
  const e = await assertRejects(() => jobs.get({}, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals(e.status, 200);
  assertStringIncludes(e.message, "no es JSON");
});

Deno.test("red caída: ErrorServidor con status null y el motivo", async () => {
  const fetch = () => Promise.reject(new TypeError("error sending request: connection refused"));
  const e = await assertRejects(() => jobs.get({}, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals(e.status, null);
  assertStringIncludes(e.message, "connection refused");
  assertInstanceOf(e.cause, TypeError);
});

Deno.test("timeout: un servidor que acepta y nunca responde da status null", async () => {
  const mudo = servidorMudo();
  try {
    const e = await assertRejects(() => jobs.get({}, { url: mudo.url, timeoutMs: 200 }), ErrorServidor);
    assertEquals([e.status, e.message], [null, "GET /jobs: el servidor no respondió en 0.2 s (timeout)"]);
  } finally {
    mudo.cerrar();
  }
});

Deno.test({
  name: "producción: jobs.get({ tecnologia: 'python' }) calza con el contrato (ONTOLOGY_PRODUCCION=1)",
  ignore: Deno.env.get("ONTOLOGY_PRODUCCION") !== "1",
  fn: async () => {
    const lista = await jobs.get({ tecnologia: "python" });
    assert(lista.length > 0, "producción no devolvió ningún puesto con python");
    assertEquals(problemas(lista, RESPUESTA_200), []);
    const pidePython = (p: (typeof lista)[number]) =>
      p.pide.some((t) => [t.nombre, ...t.sinonimos].some((n) => n.toLowerCase() === "python"));
    assertEquals(lista.filter((p) => !pidePython(p)).map((p) => p.link), []);
  },
});
