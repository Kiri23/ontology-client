// Tests de las acciones sobre un JobPost: jobs.descartar() y jobs.marcarAplicado().
//
// Los primeros usan un fetch falso: no tocan la red y corren siempre (CI incluido). El último corre contra
// un servidor de ontologyLearning LOCAL y escribe en él, así que solo corre si se le da uno:
//
//   ONTOLOGY_ACCIONES_URL=http://127.0.0.1:8800 ONTOLOGY_ACCIONES_TOKEN=prueba-local deno task test
//
// Nunca contra producción: si ONTOLOGY_ACCIONES_URL no es localhost, el test falla antes de pedir nada.
// Cada corrida descarta (y marca aplicado) un puesto que todavía no tenía decisiones; con los 4 del fixture
// de ontologyLearning alcanza para 4 corridas. Después: borrar datos/decisiones.trig del servidor.

import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import { type Schema, Validator } from "@cfworker/json-schema";
import { ErrorServidor, type JobPost, jobs } from "../mod.ts";
import { servidorMudo } from "./servidor-mudo.ts";

const PUESTO: JobPost = {
  link: "https://remotive.com/remote-jobs/prueba-python-1",
  fecha: "2026-10-10T00:00:00+00:00",
  fuente: "remotive",
  titulo: "Backend Python",
  pide: [],
};

// Un fetch que guarda el último pedido (y su body leído) y responde con `respuesta`.
function grabador(respuesta: () => Response) {
  const visto: { pedido?: Request; body?: unknown } = {};
  const fetch = async (pedido: Request) => {
    visto.pedido = pedido;
    visto.body = JSON.parse(await pedido.text());
    return respuesta();
  };
  return { fetch, visto };
}

const json = (status: number, cuerpo: unknown) => () => Response.json(cuerpo, { status });

// Corre `fn` con ONTOLOGY_ACCIONES_TOKEN en `valor` (undefined: sin la variable) y la deja como estaba.
async function conToken<T>(valor: string | undefined, fn: () => Promise<T>): Promise<T> {
  const antes = Deno.env.get(jobs.VARIABLE_TOKEN);
  if (valor === undefined) Deno.env.delete(jobs.VARIABLE_TOKEN);
  else Deno.env.set(jobs.VARIABLE_TOKEN, valor);
  try {
    return await fn();
  } finally {
    if (antes === undefined) Deno.env.delete(jobs.VARIABLE_TOKEN);
    else Deno.env.set(jobs.VARIABLE_TOKEN, antes);
  }
}

Deno.test("descartar(puesto, porque): POST /jobs/descartar con {link, porque} en JSON y el token", async () => {
  const { fetch, visto } = grabador(json(200, { ...PUESTO, descartadoEl: "2026-10-14T05:17:09+00:00", porque: "x" }));
  const r = await jobs.descartar(PUESTO, "pide 5 años de Java", { url: "http://falso", fetch, token: "t" });
  assertEquals(visto.pedido?.method, "POST");
  assertEquals(visto.pedido?.url, "http://falso/jobs/descartar");
  assertEquals(visto.pedido?.headers.get("Content-Type"), "application/json");
  assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer t");
  assertEquals(visto.body, { link: PUESTO.link, porque: "pide 5 años de Java" });
  assertEquals([r.link, r.descartadoEl], [PUESTO.link, "2026-10-14T05:17:09+00:00"]);
});

Deno.test("marcarAplicado(link): acepta el link solo y manda {link}", async () => {
  const { fetch, visto } = grabador(json(200, { ...PUESTO, aplicadoEl: "2026-10-14T05:17:21+00:00" }));
  const r = await jobs.marcarAplicado(PUESTO.link, { url: "http://falso", fetch, token: "t" });
  assertEquals(visto.pedido?.url, "http://falso/jobs/marcar-aplicado");
  assertEquals(visto.body, { link: PUESTO.link });
  assertEquals(r.aplicadoEl, "2026-10-14T05:17:21+00:00");
});

Deno.test("token: la opción le gana a ONTOLOGY_ACCIONES_TOKEN; sin ninguno, el pedido va sin Authorization", async () => {
  const { fetch, visto } = grabador(json(200, PUESTO));
  const o = { url: "http://falso", fetch };
  await conToken("de-entorno", async () => {
    await jobs.marcarAplicado(PUESTO, { ...o, token: "de-opcion" });
    assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer de-opcion");
    await jobs.marcarAplicado(PUESTO, o);
    assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer de-entorno");
    await jobs.marcarAplicado(PUESTO, { ...o, token: "  " }); // en blanco cuenta como no dado
    assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer de-entorno");
  });
  await conToken(undefined, async () => {
    await jobs.marcarAplicado(PUESTO, o);
    assertEquals(visto.pedido?.headers.get("Authorization"), null);
  });
});

Deno.test("400, 401 y 503: ErrorServidor con el status y el {error} del servidor", async () => {
  const casos: [number, string][] = [
    [400, "Ya lo descartaste."],
    [401, "falta el token o no es el correcto"],
    [503, "el servidor no tiene token configurado"],
  ];
  for (const [status, mensaje] of casos) {
    const { fetch } = grabador(json(status, { error: mensaje }));
    const e = await assertRejects(() => jobs.descartar(PUESTO, "x", { url: "http://falso", fetch }), ErrorServidor);
    assertEquals([e.status, e.message], [status, `POST /jobs/descartar: ${mensaje}`]);
  }
  const { fetch } = grabador(json(400, { error: "Ya aplicaste a este puesto." }));
  const e = await assertRejects(() => jobs.marcarAplicado(PUESTO, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals([e.status, e.message], [400, "POST /jobs/marcar-aplicado: Ya aplicaste a este puesto."]);
});

Deno.test("200 que no es un JobPost: fuera del contrato, con su status", async () => {
  for (const cuerpo of [[PUESTO], { ok: true }, null]) {
    const { fetch } = grabador(json(200, cuerpo));
    const e = await assertRejects(() => jobs.descartar(PUESTO, "x", { url: "http://falso", fetch }), ErrorServidor);
    assertEquals([e.status, e.message], [
      200,
      "POST /jobs/descartar: la respuesta no es un JobPost: fuera del contrato",
    ]);
  }
});

Deno.test("red caída y timeout: ErrorServidor con status null", async () => {
  const fetch = () => Promise.reject(new TypeError("error sending request: connection refused"));
  const e = await assertRejects(() => jobs.marcarAplicado(PUESTO, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals(e.status, null);
  assert(e.message.startsWith("POST /jobs/marcar-aplicado: sin respuesta del servidor: "), e.message);

  const mudo = servidorMudo();
  try {
    const t = await assertRejects(
      () => jobs.descartar(PUESTO, "x", { url: mudo.url, timeoutMs: 200, token: "t" }),
      ErrorServidor,
    );
    assertEquals([t.status, t.message], [null, "POST /jobs/descartar: el servidor no respondió en 0.2 s (timeout)"]);
  } finally {
    mudo.cerrar();
  }
});

// --- Contra un servidor local de ontologyLearning (ONTOLOGY_ACCIONES_URL) ---

const URL_LOCAL = Deno.env.get("ONTOLOGY_ACCIONES_URL");
const LOCALES = new Set(["127.0.0.1", "localhost", "[::1]"]);

// El 200 de cada acción, validado contra su schema en el contrato (como hace jobs.test.ts con GET /jobs).
const BASE = "https://contrato.invalid/openapi.json";
const contrato = JSON.parse(await Deno.readTextFile(new URL("../contrato/openapi.json", import.meta.url)));
function problemas(ruta: string, valor: unknown): string[] {
  const v = new Validator(
    { $ref: `${BASE}#/paths/${ruta.replaceAll("/", "~1")}/post/responses/200/content/application~1json/schema` },
    "2020-12",
    false,
  );
  v.addSchema(contrato as Schema, BASE);
  return v.validate(valor).errors.map((e) => `${e.instanceLocation} ${e.keyword}: ${e.error}`);
}

Deno.test({
  name: "servidor local: descartar, descartar otra vez, marcarAplicado, sin token (ONTOLOGY_ACCIONES_URL)",
  ignore: !URL_LOCAL,
  fn: async (t) => {
    const url = URL_LOCAL!;
    assert(LOCALES.has(new URL(url).hostname), `ONTOLOGY_ACCIONES_URL=${url} no es local: estos tests escriben`);
    assertExists(Deno.env.get(jobs.VARIABLE_TOKEN), "falta ONTOLOGY_ACCIONES_TOKEN, el token del servidor local");

    const libre = (await jobs.get({}, { url })).find((p) => !p.descartadoEl && !p.aplicadoEl);
    assertExists(libre, "no queda ningún puesto sin decisiones: borrá datos/decisiones.trig del servidor local");
    const porque = `prueba del cliente ${new Date().toISOString()}`;

    await t.step("descartar → el JobPost con descartadoEl y porque (token de ONTOLOGY_ACCIONES_TOKEN)", async () => {
      const r = await jobs.descartar(libre, porque, { url });
      assertEquals(problemas("/jobs/descartar", r), []);
      assertEquals([r.link, r.porque, r.titulo], [libre.link, porque, libre.titulo]);
      assert(r.descartadoEl && !Number.isNaN(Date.parse(r.descartadoEl)), `descartadoEl: ${r.descartadoEl}`);
      const enLista = (await jobs.get({}, { url })).find((p) => p.link === libre.link);
      assertEquals([enLista?.descartadoEl, enLista?.porque], [r.descartadoEl, porque]);
    });

    await t.step('descartar otra vez → ErrorServidor 400 "Ya lo descartaste."', async () => {
      const e = await assertRejects(() => jobs.descartar(libre.link, "otra vez", { url }), ErrorServidor);
      assertEquals([e.status, e.message], [400, "POST /jobs/descartar: Ya lo descartaste."]);
    });

    await t.step("marcarAplicado(link) → aplicadoEl, y el descarte sigue", async () => {
      const r = await jobs.marcarAplicado(libre.link, { url });
      assertEquals(problemas("/jobs/marcar-aplicado", r), []);
      assert(r.aplicadoEl && !Number.isNaN(Date.parse(r.aplicadoEl)), `aplicadoEl: ${r.aplicadoEl}`);
      assertEquals(r.porque, porque);
    });

    await t.step("sin token o con otro → ErrorServidor 401", async () => {
      const sin = await conToken(
        undefined,
        () => assertRejects(() => jobs.descartar(libre, "x", { url }), ErrorServidor),
      );
      assertEquals([sin.status, sin.message], [401, "POST /jobs/descartar: falta el token o no es el correcto"]);
      const otro = await assertRejects(
        () => jobs.marcarAplicado(libre, { url, token: "otro" }),
        ErrorServidor,
      );
      assertEquals(otro.status, 401);
    });
  },
});
