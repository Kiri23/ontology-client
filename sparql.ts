// sparql.ts — GET /sparql del servidor: una consulta SPARQL y la respuesta tal cual vino (su content-type y su texto).
// /sparql no está en el contrato (contrato/openapi.json): lo sirve el mismo servidor, pero su respuesta no es JSON de
// una forma fija sino lo que pida la consulta. Por eso este módulo no pasa por openapi-fetch: hace el fetch con las
// mismas opciones, el mismo timeout y el mismo ErrorServidor que el resto del SDK.

import { ErrorServidor, mensajeDeError, type OpcionesPedido, TIMEOUT_MS, URL_PRODUCCION } from "./cliente.ts";

/** Opciones de {@link consultar}: las de todo pedido, más el formato que se pide. */
export interface OpcionesSparql extends OpcionesPedido {
  /**
   * El header `Accept`. Default `application/sparql-results+json`. El servidor lo respeta en SELECT y ASK
   * (`application/sparql-results+json`, `text/csv`); en CONSTRUCT lo ignora y siempre manda Turtle.
   */
  accept?: string;
}

/** La respuesta de /sparql sin interpretar: `tipo` es el content-type (`text/turtle; charset=utf-8`). */
export interface RespuestaSparql {
  tipo: string;
  texto: string;
}

/** El `Accept` por default: resultados de SELECT/ASK en JSON. */
export const ACCEPT_RESULTADOS = "application/sparql-results+json";

/**
 * Corre una consulta SPARQL en el servidor (`GET /sparql?query=`) y devuelve la respuesta tal cual: el
 * content-type y el texto. Quien llama decide cómo leerla (JSON de resultados, CSV, Turtle).
 *
 * ```ts
 * const { tipo, texto } = await sparql.consultar("SELECT ?c (COUNT(*) AS ?n) WHERE { ?s a ?c } GROUP BY ?c");
 * const filas = JSON.parse(texto).results.bindings;
 * ```
 *
 * Tira {@link ErrorServidor} si el servidor no la corre: 400 con el `{"error": ...}` del servidor (la consulta no
 * parsea o pide algo que no se permite), otro status si falla, o `status: null` si no hubo respuesta (red caída,
 * timeout).
 */
export async function consultar(consulta: string, opciones: OpcionesSparql = {}): Promise<RespuestaSparql> {
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  const base = opciones.fetch ?? globalThis.fetch;
  const url = new URL("/sparql", opciones.url || URL_PRODUCCION);
  url.searchParams.set("query", consulta);
  const corte = new AbortController();
  const reloj = setTimeout(
    () => corte.abort(new DOMException(`sin respuesta en ${timeoutMs} ms`, "TimeoutError")),
    timeoutMs,
  );
  const fallo = (status: number | null, detalle: string, cause?: unknown) =>
    new ErrorServidor(status, `GET /sparql: ${detalle}`, cause === undefined ? undefined : { cause });
  try {
    const respuesta = await base(
      new Request(url, { headers: { Accept: opciones.accept ?? ACCEPT_RESULTADOS }, signal: corte.signal }),
    );
    const texto = await respuesta.text();
    if (!respuesta.ok) throw fallo(respuesta.status, mensajeDeError(leerJson(texto) ?? texto, respuesta.status));
    return { tipo: respuesta.headers.get("Content-Type") ?? "", texto };
  } catch (e) {
    if (e instanceof ErrorServidor) throw e;
    if (corte.signal.aborted) throw fallo(null, `el servidor no respondió en ${timeoutMs / 1000} s (timeout)`);
    throw fallo(null, `sin respuesta del servidor: ${(e as Error).message}`, e);
  } finally {
    clearTimeout(reloj);
  }
}

// El {"error": ...} de un 400; si el body no es JSON, undefined y el mensaje es el texto.
function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}
