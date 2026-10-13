// jobs.ts — la clase JobPost de la ontología, como módulo: `import { jobs } from "@kiri23/ontology-client"`
// y `jobs.get()`. Un módulo por clase, no por endpoint: lo que el SDK sepa hacer con los puestos vive acá.
//
// El tipo no se escribe a mano. La cadena es: j:JobPostShape (SHACL, en el servidor) → el schema JobPost
// de contrato/openapi.json → components["schemas"]["JobPost"] en generado/api.ts → JobPost acá.
//
// POST /jobs (traer puestos nuevos con kiri-jobs) no tiene método: su 200 no declara schema, así que
// devolvería `unknown`. Mientras tanto va por crearCliente().POST("/jobs", ...).

import type { ClientOptions } from "openapi-fetch";
import type { components, operations } from "./generado/api.ts";
import { crearCliente, ErrorServidor, mensajeDeError, TIMEOUT_MS } from "./cliente.ts";

/** Un puesto de trabajo, con la forma de j:JobPostShape: el schema JobPost del contrato. */
export type JobPost = components["schemas"]["JobPost"];

/** Una tecnología que un puesto pide: el schema Technology del contrato. */
export type Technology = components["schemas"]["Technology"];

/** Los filtros de GET /jobs, del contrato: `tecnologia` (python, ts, node…) y `fuente` (remotive, hn). */
export type FiltrosJobs = NonNullable<operations["jobs_get"]["parameters"]["query"]>;

/** Opciones de {@link get}. */
export interface OpcionesJobs {
  /** La URL base del servidor; default https://ontology.kiri231.com. */
  url?: string;
  /** Un fetch propio (tests, proxies). Recibe un Request, como en openapi-fetch. */
  fetch?: ClientOptions["fetch"];
  /** Cuánto esperar la respuesta entera, en milisegundos; default 30 000. */
  timeoutMs?: number;
}

/**
 * Los puestos, lo más nuevo primero. Sin filtros, todos.
 *
 * ```ts
 * const lista = await jobs.get({ tecnologia: "python" });
 * lista[0].pide[0].nombre;
 * ```
 *
 * Tira {@link ErrorServidor} si el servidor no los da: 503 cuando sus datos son de una forma vieja (el
 * mensaje dice cómo rehacerlos), 400, un 200 que no es una lista, red caída o timeout (`status: null`).
 */
export async function get(filtros: FiltrosJobs = {}, opciones: OpcionesJobs = {}): Promise<JobPost[]> {
  // El status de la última respuesta: openapi-fetch tira si un 2xx no es JSON, y ahí el status se pierde.
  let status: number | null = null;
  const base = opciones.fetch ?? globalThis.fetch;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  // Como en validarProyecto: un AbortController con su setTimeout, que se limpia al terminar.
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
    const { data, error, response } = await cliente.GET("/jobs", {
      params: { query: filtros },
      signal: corte.signal,
    });
    if (!response.ok) {
      throw new ErrorServidor(response.status, `GET /jobs: ${mensajeDeError(error, response.status)}`);
    }
    if (!Array.isArray(data)) {
      throw new ErrorServidor(
        response.status,
        "GET /jobs: la respuesta no es una lista de JobPost: fuera del contrato",
      );
    }
    return data;
  } catch (e) {
    if (e instanceof ErrorServidor) throw e;
    if (corte.signal.aborted) {
      throw new ErrorServidor(null, `GET /jobs: el servidor no respondió en ${timeoutMs / 1000} s (timeout)`);
    }
    if (status !== null) {
      throw new ErrorServidor(status, `GET /jobs: la respuesta no es JSON: fuera del contrato`, { cause: e });
    }
    throw new ErrorServidor(null, `GET /jobs: sin respuesta del servidor: ${(e as Error).message}`, { cause: e });
  } finally {
    clearTimeout(reloj);
  }
}
