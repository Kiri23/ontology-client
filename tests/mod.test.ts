// Tests de validarProyecto y validarVocabulario con un fetch falso: nunca tocan la red.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { crearCliente, URL_PRODUCCION, validarProyecto, validarVocabulario } from "../mod.ts";
import { servidorMudo } from "./servidor-mudo.ts";
import { atenderFalso, MARCA_NO_CONFORMA } from "./servidor-falso.ts";

const FICHA = '@prefix k: <https://kiri23.dev/catalogo#> .\nk:x a k:Proyecto ; k:nota "con \\"comillas\\"" .\n';

// Un fetch que guarda el último pedido y responde con `atender`.
function grabador(atender: (pedido: Request) => Promise<Response>) {
  const visto: { pedido?: Request; cuerpo?: string } = {};
  const fetch = async (pedido: Request) => {
    visto.pedido = pedido;
    visto.cuerpo = await pedido.clone().text();
    return atender(pedido);
  };
  return { fetch, visto };
}

Deno.test("200 conforma: manda la ficha cruda como text/turtle con el Bearer", async () => {
  const { fetch, visto } = grabador(atenderFalso("secreto"));
  const r = await validarProyecto(FICHA, { token: "secreto", url: "http://falso/", fetch });
  assertEquals(r, { ok: true, conforma: true, reporte: "Conforms: True" });
  assertEquals(visto.pedido?.method, "POST");
  assertEquals(visto.pedido?.url, "http://falso/proyectos");
  assertEquals(visto.pedido?.headers.get("Content-Type"), "text/turtle; charset=utf-8");
  assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer secreto");
  assertEquals(visto.cuerpo, FICHA); // sin JSON.stringify: el bug que evita bodySerializer
});

const VOCABULARIO =
  "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n<https://kiri23.dev/vocabulario/p#v> a skos:ConceptScheme .\n";

Deno.test("validarVocabulario: POST /vocabularios con el mismo Bearer y el mismo Resultado", async () => {
  const { fetch, visto } = grabador(atenderFalso("secreto"));
  const r = await validarVocabulario(VOCABULARIO, { token: "secreto", url: "http://falso/", fetch });
  assertEquals(r, { ok: true, conforma: true, reporte: "Conforms: True" });
  assertEquals(visto.pedido?.url, "http://falso/vocabularios");
  assertEquals(visto.pedido?.headers.get("Content-Type"), "text/turtle; charset=utf-8");
  assertEquals(visto.pedido?.headers.get("Authorization"), "Bearer secreto");
  assertEquals(visto.cuerpo, VOCABULARIO);
  const no = await validarVocabulario(VOCABULARIO + MARCA_NO_CONFORMA, {
    token: "secreto",
    url: "http://falso",
    fetch,
  });
  assertEquals(no.ok && no.conforma, false);
  const sinToken = await validarVocabulario(VOCABULARIO, { token: "otro", url: "http://falso", fetch });
  assertEquals(sinToken, { ok: false, status: 401, error: "falta el token o no es el correcto" });
});

Deno.test("200 no conforma: es un resultado, no un error", async () => {
  const { fetch } = grabador(atenderFalso("secreto"));
  const r = await validarProyecto(FICHA + MARCA_NO_CONFORMA, { token: "secreto", url: "http://falso", fetch });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.conforma, false);
    assertStringIncludes(r.reporte, "Conforms: False");
  }
});

Deno.test("401: token malo", async () => {
  const { fetch } = grabador(atenderFalso("secreto"));
  const r = await validarProyecto(FICHA, { token: "otro", url: "http://falso", fetch });
  assertEquals(r, { ok: false, status: 401, error: "falta el token o no es el correcto" });
});

Deno.test("503: servidor sin token configurado", async () => {
  const { fetch } = grabador(atenderFalso(undefined));
  const r = await validarProyecto(FICHA, { token: "x", url: "http://falso", fetch });
  assertEquals(r, { ok: false, status: 503, error: "el servidor no tiene token configurado" });
});

Deno.test("400: ficha vacía", async () => {
  const { fetch } = grabador(atenderFalso("secreto"));
  const r = await validarProyecto("  \n", { token: "secreto", url: "http://falso", fetch });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 400);
});

Deno.test("red caída: status null y el motivo", async () => {
  const fetch = () => Promise.reject(new TypeError("error sending request: connection refused"));
  const r = await validarProyecto(FICHA, { token: "x", url: "http://falso", fetch });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.status, null);
    assertStringIncludes(r.error, "connection refused");
  }
});

Deno.test("200 que no es JSON: fuera del contrato, con su status", async () => {
  const fetch = () => Promise.resolve(new Response("<html>hola</html>", { status: 200 }));
  const r = await validarProyecto(FICHA, { token: "x", url: "http://falso", fetch });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.status, 200);
    assertStringIncludes(r.error, "no es JSON");
  }
});

Deno.test("200 JSON sin {conforma, reporte}: fuera del contrato", async () => {
  const fetch = () => Promise.resolve(Response.json({ otra: "cosa" }));
  const r = await validarProyecto(FICHA, { token: "x", url: "http://falso", fetch });
  assertEquals(r, { ok: false, status: 200, error: "la respuesta no trae {conforma, reporte}: fuera del contrato" });
});

Deno.test("502 de un proxy con HTML: el texto, recortado", async () => {
  const fetch = () => Promise.resolve(new Response("Bad Gateway", { status: 502 }));
  const r = await validarProyecto(FICHA, { token: "x", url: "http://falso", fetch });
  assertEquals(r, { ok: false, status: 502, error: "Bad Gateway" });
});

Deno.test("timeout: un servidor que acepta y nunca responde vuelve como status null", async () => {
  const mudo = servidorMudo();
  try {
    const r = await validarProyecto(FICHA, { token: "x", url: mudo.url, timeoutMs: 200 });
    assertEquals(r, { ok: false, status: null, error: "el servidor no respondió en 0.2 s (timeout)" });
  } finally {
    mudo.cerrar();
  }
});

Deno.test("crearCliente({ baseUrl: undefined }) cae a producción", async () => {
  let url = "";
  const cliente = crearCliente({
    baseUrl: undefined,
    fetch: (pedido: Request) => {
      url = pedido.url;
      return Promise.resolve(Response.json({ conforma: true, reporte: "" }));
    },
  });
  await cliente.POST("/proyectos", { body: FICHA, bodySerializer: (t: string) => t });
  assertEquals(url, `${URL_PRODUCCION}/proyectos`);
});
