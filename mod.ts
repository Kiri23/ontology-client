// @kiri23/ontology-client — el cliente HTTP de ontologyLearning: valida fichas proyecto.ttl y lee los
// puestos de trabajo.
//
// Un módulo por clase de la ontología, no por endpoint, y la capa de abajo queda a la vista:
//
//   crearCliente(opciones)        el Client de openapi-fetch tipado con los paths del contrato
//                                 (generado/api.ts). Es la librería tal cual: .POST, .GET, .use(middleware).
//   validarProyecto(turtle, o)    POST /proyectos con la ficha, y la respuesta reducida a un Resultado.
//   jobs.get(filtros?, o?)        GET /jobs: los puestos como JobPost[] (jobs.ts).
//   jobs.descartar(job, porque)   POST /jobs/descartar y POST /jobs/marcar-aplicado (jobs.marcarAplicado):
//                                 las acciones sobre un puesto; devuelven el JobPost como queda.
//
// Los tipos salen del contrato (contrato/openapi.json, que genera el servidor): nada de acá describe
// el endpoint a mano. El motor y las reglas son privados; por HTTP sale solo el reporte.

import type { ClientOptions } from "openapi-fetch";
import type { paths } from "./generado/api.ts";
import { crearCliente, mensajeDeError, TIMEOUT_MS } from "./cliente.ts";

export type { components, operations, paths } from "./generado/api.ts";
export { crearCliente, ErrorServidor, TIMEOUT_MS, URL_PRODUCCION } from "./cliente.ts";
export * as jobs from "./jobs.ts";
export type { FiltrosJobs, JobPost, OpcionesAcciones, OpcionesJobs, ReferenciaJob, Technology } from "./jobs.ts";

/** Lo que responde POST /proyectos con 200, tal como lo declara el contrato. */
export type Validacion = paths["/proyectos"]["post"]["responses"][200]["content"]["application/json"];

/**
 * El resultado de validar una ficha. `ok: true` es que el servidor la validó: `conforma` dice si pasó
 * las reglas (no conformar no es un error). `ok: false` es que no se pudo validar: `status` es el HTTP
 * (400 turtle roto, 401 token, 413 muy grande, 415 content-type, 503 servidor sin token…) o `null` si
 * no hubo respuesta (red caída, DNS, TLS, o se cumplió el timeout).
 */
export type Resultado =
  | ({ ok: true } & Validacion)
  | { ok: false; status: number | null; error: string };

/** Opciones de {@link validarProyecto}. */
export interface OpcionesValidar {
  /** El token del servidor (Authorization: Bearer). */
  token: string;
  /** La URL base del servidor; default {@link URL_PRODUCCION}. */
  url?: string;
  /** Un fetch propio (tests, proxies). Recibe un Request, como en openapi-fetch. */
  fetch?: ClientOptions["fetch"];
  /** Cuánto esperar la respuesta entera, en milisegundos; default {@link TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Valida una ficha Turtle contra el servidor. Nunca tira: todo lo que pasa vuelve como {@link Resultado}. */
export async function validarProyecto(turtle: string, opciones: OpcionesValidar): Promise<Resultado> {
  // El status de la última respuesta: openapi-fetch tira si un 2xx no es JSON, y ahí el status se pierde.
  let status: number | null = null;
  const base = opciones.fetch ?? globalThis.fetch;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  // Un AbortController con su setTimeout, y no AbortSignal.timeout: el timer se limpia al terminar y no
  // queda vivo en el proceso (ni en los tests).
  const corte = new AbortController();
  const reloj = setTimeout(
    () => corte.abort(new DOMException(`sin respuesta en ${timeoutMs} ms`, "TimeoutError")),
    timeoutMs,
  );
  const cliente = crearCliente({
    baseUrl: opciones.url,
    fetch: async (pedido: Request) => {
      const respuesta = await base(pedido);
      status = respuesta.status;
      return respuesta;
    },
  });
  try {
    const { data, error, response } = await cliente.POST("/proyectos", {
      body: turtle,
      // openapi-fetch serializa el body a JSON por default: la ficha saldría entre comillas.
      bodySerializer: (ficha: string) => ficha,
      headers: { "Content-Type": "text/turtle; charset=utf-8", Authorization: `Bearer ${opciones.token}` },
      signal: corte.signal,
    });
    if (response.ok) {
      if (typeof data?.conforma === "boolean" && typeof data.reporte === "string") {
        return { ok: true, conforma: data.conforma, reporte: data.reporte };
      }
      return {
        ok: false,
        status: response.status,
        error: "la respuesta no trae {conforma, reporte}: fuera del contrato",
      };
    }
    return { ok: false, status: response.status, error: mensajeDeError(error, response.status) };
  } catch (e) {
    if (corte.signal.aborted) {
      return { ok: false, status: null, error: `el servidor no respondió en ${timeoutMs / 1000} s (timeout)` };
    }
    if (status !== null) {
      return { ok: false, status, error: `la respuesta no es JSON: fuera del contrato (${(e as Error).message})` };
    }
    return { ok: false, status: null, error: `sin respuesta del servidor: ${(e as Error).message}` };
  } finally {
    clearTimeout(reloj);
  }
}
