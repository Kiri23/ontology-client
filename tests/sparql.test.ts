// Tests de sparql.consultar() con un fetch falso: nunca tocan la red (el del timeout usa un servidor local mudo).

import { assertEquals, assertRejects } from "@std/assert";
import { ErrorServidor, sparql, URL_PRODUCCION } from "../mod.ts";
import { servidorMudo } from "./servidor-mudo.ts";

const SELECT = "SELECT ?c WHERE { ?s a ?c } LIMIT 2";
const RESULTADOS = '{"head":{"vars":["c"]},"results":{"bindings":[]}}';

// Un fetch que guarda el último pedido y responde con `respuesta`.
function grabador(respuesta: () => Response) {
  const visto: { pedido?: Request } = {};
  const fetch = (pedido: Request) => {
    visto.pedido = pedido;
    return Promise.resolve(respuesta());
  };
  return { fetch, visto };
}

Deno.test("sparql.consultar(): GET /sparql?query= con el Accept de resultados JSON, y la respuesta tal cual", async () => {
  const tipo = "application/sparql-results+json; charset=utf-8";
  const { fetch, visto } = grabador(() => new Response(RESULTADOS, { headers: { "Content-Type": tipo } }));
  const r = await sparql.consultar(SELECT, { url: "http://falso", fetch });
  assertEquals(r, { tipo, texto: RESULTADOS });
  assertEquals(visto.pedido?.method, "GET");
  const url = new URL(visto.pedido!.url);
  assertEquals([url.origin, url.pathname, url.searchParams.get("query")], ["http://falso", "/sparql", SELECT]);
  assertEquals(visto.pedido?.headers.get("Accept"), "application/sparql-results+json");
});

Deno.test("sparql.consultar(): el Accept pedido viaja, y un CONSTRUCT devuelve el Turtle con su tipo", async () => {
  const turtle = "<urn:a> <urn:p> <urn:b> .\n";
  const { fetch, visto } = grabador(() =>
    new Response(turtle, { headers: { "Content-Type": "text/turtle; charset=utf-8" } })
  );
  const r = await sparql.consultar("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }", {
    url: "http://falso",
    fetch,
    accept: "text/turtle",
  });
  assertEquals(r, { tipo: "text/turtle; charset=utf-8", texto: turtle });
  assertEquals(visto.pedido?.headers.get("Accept"), "text/turtle");
});

Deno.test("sparql.consultar(): sin url va a producción", async () => {
  const { fetch, visto } = grabador(() => new Response(RESULTADOS));
  await sparql.consultar(SELECT, { fetch });
  assertEquals(new URL(visto.pedido!.url).origin, URL_PRODUCCION);
});

Deno.test("sparql.consultar(): 400 es ErrorServidor con el {error} del servidor", async () => {
  const { fetch } = grabador(() => Response.json({ error: "la consulta no parsea" }, { status: 400 }));
  const e = await assertRejects(() => sparql.consultar("SELEC", { url: "http://falso", fetch }), ErrorServidor);
  assertEquals([e.status, e.message], [400, "GET /sparql: la consulta no parsea"]);
});

Deno.test("sparql.consultar(): un 502 que no es JSON da su texto", async () => {
  const { fetch } = grabador(() => new Response("Bad Gateway", { status: 502 }));
  const e = await assertRejects(() => sparql.consultar(SELECT, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals([e.status, e.message], [502, "GET /sparql: Bad Gateway"]);
});

Deno.test("sparql.consultar(): red caída es ErrorServidor con status null", async () => {
  const fetch = () => Promise.reject(new TypeError("conexión rechazada"));
  const e = await assertRejects(() => sparql.consultar(SELECT, { url: "http://falso", fetch }), ErrorServidor);
  assertEquals([e.status, e.message], [null, "GET /sparql: sin respuesta del servidor: conexión rechazada"]);
});

Deno.test("sparql.consultar(): timeout con un servidor que acepta y nunca responde", async () => {
  const mudo = servidorMudo();
  try {
    const e = await assertRejects(() => sparql.consultar(SELECT, { url: mudo.url, timeoutMs: 200 }), ErrorServidor);
    assertEquals([e.status, e.message], [null, "GET /sparql: el servidor no respondió en 0.2 s (timeout)"]);
  } finally {
    mudo.cerrar();
  }
});
