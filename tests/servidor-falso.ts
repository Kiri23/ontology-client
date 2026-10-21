// servidor-falso.ts — imita el contrato de POST /proyectos y POST /vocabularios sin el motor ni las reglas (que son
// privados). Las dos puertas responden igual; la regla de juguete es la misma.
//
//   deno run --allow-net --allow-read tests/servidor-falso.ts [--puerto 8787] [--token prueba]
//
// Lo usan los tests del CLI y el job de CI que prueba la action. Las respuestas son las del contrato
// (contrato/openapi.json); "validar" es una regla de juguete: una ficha no conforma si trae la línea
// MARCA_NO_CONFORMA. Sin --token, responde 503 como el servidor real sin token configurado.

import { parseArgs } from "@std/cli/parse-args";

export const MARCA_NO_CONFORMA = "# servidor-falso: no conforma";
const TOPE_CUERPO = 256 * 1024;
const CONTRATO = new URL("../contrato/openapi.json", import.meta.url);

const json = (status: number, cuerpo: unknown) => Response.json(cuerpo, { status });

/** El handler del servidor falso: también sirve como `fetch` falso en los tests. */
export function atenderFalso(token: string | undefined): (pedido: Request) => Promise<Response> {
  return async (pedido) => {
    const ruta = new URL(pedido.url).pathname;
    if (ruta === "/openapi.json" && pedido.method === "GET") {
      return new Response(await Deno.readTextFile(CONTRATO), { headers: { "Content-Type": "application/json" } });
    }
    if (ruta !== "/proyectos" && ruta !== "/vocabularios") return json(404, { error: "no existe" });
    if (pedido.method !== "POST") return json(405, { error: `${ruta.slice(1)} va por POST` });
    if (!token) return json(503, { error: "el servidor no tiene token configurado" });
    const [esquema, recibido] = (pedido.headers.get("Authorization") ?? "").split(" ");
    if (esquema?.toLowerCase() !== "bearer" || recibido !== token) {
      return json(401, { error: "falta el token o no es el correcto" });
    }
    const cuerpo = await pedido.text();
    if (new TextEncoder().encode(cuerpo).length > TOPE_CUERPO) {
      return json(413, { error: `el body pasa el tope de ${TOPE_CUERPO} bytes` });
    }
    const tipo = (pedido.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (cuerpo && tipo !== "text/turtle") return json(415, { error: `el body va como text/turtle, no ${tipo}` });
    if (!cuerpo.trim()) {
      return json(400, { error: `falta: ${ruta === "/proyectos" ? "fichas" : "vocabularios"} (el body, text/turtle)` });
    }
    if (cuerpo.includes(MARCA_NO_CONFORMA)) {
      return json(200, {
        conforma: false,
        reporte: "Conforms: False\nResults (1):\n  la ficha trae la marca de no conforme",
      });
    }
    return json(200, { conforma: true, reporte: "Conforms: True" });
  };
}

/**
 * Levanta el servidor falso. Puerto 0: uno libre (server.addr.port). Por la red exige además
 * Content-Length, como el real (411: el body no puede ir chunked); en memoria no aplica, porque un
 * Request armado a mano no trae esa cabecera.
 */
export function servidorFalso(opciones: { puerto?: number; token?: string }): Deno.HttpServer<Deno.NetAddr> {
  const atender = atenderFalso(opciones.token);
  return Deno.serve({ port: opciones.puerto ?? 0, hostname: "127.0.0.1", onListen: () => {} }, (pedido) => {
    if (pedido.method === "POST" && pedido.body && !pedido.headers.has("Content-Length")) {
      return json(411, { error: "falta Content-Length (el body no puede ir chunked)" });
    }
    return atender(pedido);
  });
}

if (import.meta.main) {
  const o = parseArgs(Deno.args, { string: ["puerto", "token"], default: { puerto: "8787" } });
  const servidor = servidorFalso({ puerto: Number(o.puerto), token: o.token });
  console.log(`servidor falso en http://127.0.0.1:${servidor.addr.port}`);
}
