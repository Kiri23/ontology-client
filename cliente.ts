// cliente.ts — lo que comparten los módulos del SDK (mod.ts para proyectos, jobs.ts para jobs): el Client
// de openapi-fetch con los paths del contrato, la URL de producción y cómo se lee un {"error": ...}.

import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generado/api.ts";

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
  // Después del spread: un `baseUrl: undefined` explícito (Deno.env.get de algo que no está) cae al default.
  return createClient<paths>({ ...opciones, baseUrl: opciones.baseUrl || URL_PRODUCCION });
}

/** El timeout por default de cada pedido: 30 s. Una ficha se valida y los puestos se leen en menos de un segundo. */
export const TIMEOUT_MS = 30_000;

/**
 * El servidor no hizo lo que se le pidió. `status` es el HTTP (503, 400…) o `null` si no hubo respuesta
 * (red caída, DNS, TLS, timeout). El mensaje trae el `{"error": ...}` del servidor tal cual.
 */
export class ErrorServidor extends Error {
  override name: string = "ErrorServidor";
  /** El HTTP de la respuesta, o `null` si no la hubo. */
  readonly status: number | null;

  constructor(status: number | null, mensaje: string, opciones?: ErrorOptions) {
    super(mensaje, opciones);
    this.status = status;
  }
}

// El {"error": ...} del contrato; si el body es otra cosa (un 502 de un proxy, HTML), un resumen.
export function mensajeDeError(error: unknown, status: number): string {
  if (typeof error === "object" && error !== null && typeof (error as { error?: unknown }).error === "string") {
    return (error as { error: string }).error;
  }
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 200);
  return `HTTP ${status}`;
}
