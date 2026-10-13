// @kiri23/ontology-client — el cliente HTTP del validador de fichas proyecto.ttl de ontologyLearning.
//
// Dos capas, y la de abajo queda a la vista:
//
//   crearCliente(opciones)        el Client de openapi-fetch tipado con los paths del contrato
//                                 (generado/api.ts). Es la librería tal cual: .POST, .GET, .use(middleware).
//   validarProyecto(turtle, o)    lo único que se agrega encima: POST /proyectos con la ficha, y la
//                                 respuesta reducida a un Resultado.
//
// Los tipos salen del contrato (contrato/openapi.json, que genera el servidor): nada de acá describe
// el endpoint a mano. El motor y las reglas son privados; por HTTP sale solo el reporte.

import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generado/api.ts";

export type { components, operations, paths } from "./generado/api.ts";

/** El servidor de producción de ontologyLearning. */
export const URL_PRODUCCION = "https://ontology.kiri231.com";

/**
 * El cliente de openapi-fetch con los paths del contrato. `baseUrl` es {@link URL_PRODUCCION} si no
 * se pasa otra. Es el `Client` de openapi-fetch sin envoltorio: middleware, fetch propio, todo lo suyo.
 *
 * ```ts
 * const cliente = crearCliente({ headers: { Authorization: `Bearer ${token}` } });
 * const { data, error } = await cliente.POST("/proyectos", {
 *   body: ficha,
 *   bodySerializer: (t) => t,
 *   headers: { "Content-Type": "text/turtle" },
 * });
 * ```
 */
export function crearCliente(opciones: ClientOptions = {}): Client<paths> {
  return createClient<paths>({ baseUrl: URL_PRODUCCION, ...opciones });
}

/** Lo que responde POST /proyectos con 200, tal como lo declara el contrato. */
export type Validacion = paths["/proyectos"]["post"]["responses"][200]["content"]["application/json"];

/**
 * El resultado de validar una ficha. `ok: true` es que el servidor la validó: `conforma` dice si pasó
 * las reglas (no conformar no es un error). `ok: false` es que no se pudo validar: `status` es el HTTP
 * (400 turtle roto, 401 token, 413 muy grande, 415 content-type, 503 servidor sin token…) o `null` si
 * no hubo respuesta (red caída, DNS, TLS).
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
}

/** Valida una ficha Turtle contra el servidor. Nunca tira: todo lo que pasa vuelve como {@link Resultado}. */
export async function validarProyecto(turtle: string, opciones: OpcionesValidar): Promise<Resultado> {
  // El status de la última respuesta: openapi-fetch tira si un 2xx no es JSON, y ahí el status se pierde.
  let status: number | null = null;
  const base = opciones.fetch ?? globalThis.fetch;
  const cliente = crearCliente({
    baseUrl: (opciones.url ?? URL_PRODUCCION).replace(/\/+$/, ""),
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
    if (status !== null) {
      return { ok: false, status, error: `la respuesta no es JSON: fuera del contrato (${(e as Error).message})` };
    }
    return { ok: false, status: null, error: `sin respuesta del servidor: ${(e as Error).message}` };
  }
}

// El {"error": ...} del contrato; si el body es otra cosa (un 502 de un proxy, HTML), un resumen.
function mensajeDeError(error: unknown, status: number): string {
  if (typeof error === "object" && error !== null && typeof (error as { error?: unknown }).error === "string") {
    return (error as { error: string }).error;
  }
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 200);
  return `HTTP ${status}`;
}
