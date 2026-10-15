// Tests de jobs.get() con un fetch falso que responde tests/datos/jobs.json (tres puestos tal como los dio
// producción el 2026-10-13). No tocan la red, salvo el último: con ONTOLOGY_PRODUCCION=1 llama a producción.
//
// La forma se chequea contra el schema del contrato (contrato/openapi.json, tests/esquema.ts), no contra una lista
// de campos escrita acá: si el servidor cambia JobPost, este chequeo cambia con él.

import { assert, assertEquals, assertInstanceOf, assertRejects, assertStringIncludes } from "@std/assert";
import { ErrorServidor, jobs } from "../mod.ts";
import { problemas } from "./esquema.ts";
import { servidorMudo } from "./servidor-mudo.ts";

const FIXTURE = await Deno.readTextFile(new URL("./datos/jobs.json", import.meta.url));

// Que `valor` no calce y que entre los problemas esté `esperado` (la ruta y el motivo).
function marca(valor: unknown, esperado: RegExp): void {
  const vistos = problemas(valor);
  assert(vistos.some((p) => esperado.test(p)), `se esperaba ${esperado}; el validador dijo ${JSON.stringify(vistos)}`);
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

Deno.test("el chequeo de forma muerde: un campo que JobPost o Technology no declaran no pasa", () => {
  const [puesto] = JSON.parse(FIXTURE);
  marca([{ ...puesto, salario: 1 }], /^#\/0 (additional|unevaluated)Properties: Property "salario"/);
  marca(
    [{ ...puesto, pide: [{ ...puesto.pide[0], version: "3" }] }],
    /^#\/0\/pide\/0 (additional|unevaluated)Properties: Property "version"/,
  );
});

Deno.test("el chequeo de forma muerde: un campo que falta o con otro formato no pasa", () => {
  const [puesto] = JSON.parse(FIXTURE);
  const { titulo: _, ...sinTitulo } = puesto;
  marca([sinTitulo], /^#\/0 required: .*"titulo"/);
  marca(
    [{ ...puesto, pide: [{ link: "https://kiri23.dev/tech#X", sinonimos: [] }] }],
    /^#\/0\/pide\/0 required: .*"nombre"/,
  );
  marca([{ ...puesto, fecha: "ayer" }], /^#\/0\/fecha format: /);
});

Deno.test("jobs.get(): GET /jobs sin token, y la lista calza con el schema JobPost[] del contrato", async () => {
  const { fetch, visto } = grabador(fixture);
  const lista = await jobs.get({}, { url: "http://falso", fetch });
  assertEquals(visto.pedido?.method, "GET");
  assertEquals(visto.pedido?.url, "http://falso/jobs");
  assertEquals(visto.pedido?.headers.get("Authorization"), null);
  assertEquals(lista.length, 3);
  assertEquals(problemas(lista), []);
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
    assertEquals(problemas(lista), []);
    const pidePython = (p: (typeof lista)[number]) =>
      p.pide.some((t) => [t.nombre, ...t.sinonimos].some((n) => n.toLowerCase() === "python"));
    assertEquals(lista.filter((p) => !pidePython(p)).map((p) => p.link), []);
  },
});
