// cliente.ts — lo que comparten los módulos del SDK (mod.ts para proyectos, jobs.ts para jobs): el Client
// de openapi-fetch con los paths del contrato, la URL de producción, cómo se lee un {"error": ...} y pedir(),
// un pedido con su timeout donde todo lo que no es un 200 de la forma esperada termina en ErrorServidor.

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

/** Lo que todo pedido acepta: a dónde, con qué fetch y cuánto esperar. */
export interface OpcionesPedido {
  /** La URL base del servidor; default {@link URL_PRODUCCION}. */
  url?: string;
  /** Un fetch propio (tests, proxies). Recibe un Request, como en openapi-fetch. */
  fetch?: ClientOptions["fetch"];
  /** Cuánto esperar la respuesta entera, en milisegundos; default {@link TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Lo mínimo que se chequea de un 200 antes de devolverlo con su tipo: la forma entera la garantiza el contrato. */
export interface Forma {
  es: (data: unknown) => boolean;
  /** Lo que le falta a la respuesta cuando no es: "no es un JobPost" → "la respuesta no es un JobPost: fuera…". */
  motivo: string;
}

/**
 * Un pedido de openapi-fetch con su timeout. Devuelve el `data` de un 2xx que tiene la `forma`; todo lo demás
 * tira {@link ErrorServidor} con el status (o `null` si no hubo respuesta). `etiqueta` ("GET /jobs") va
 * adelante de cada mensaje; sin ella, el mensaje es el detalle solo.
 */
export async function pedir<D>(
  opciones: OpcionesPedido,
  llamar: (cliente: Client<paths>, signal: AbortSignal) => Promise<{ data?: D; error?: unknown; response: Response }>,
  forma: Forma,
  etiqueta?: string,
): Promise<D> {
  const fallo = (status: number | null, detalle: string, cause?: unknown) =>
    new ErrorServidor(
      status,
      etiqueta ? `${etiqueta}: ${detalle}` : detalle,
      cause === undefined ? undefined : { cause },
    );
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
    const { data, error, response } = await llamar(cliente, corte.signal);
    if (!response.ok) throw fallo(response.status, mensajeDeError(error, response.status));
    if (!forma.es(data)) throw fallo(response.status, `la respuesta ${forma.motivo}: fuera del contrato`);
    return data as D;
  } catch (e) {
    if (e instanceof ErrorServidor) throw e;
    if (corte.signal.aborted) throw fallo(null, `el servidor no respondió en ${timeoutMs / 1000} s (timeout)`);
    if (status !== null) {
      throw fallo(status, `la respuesta no es JSON: fuera del contrato (${(e as Error).message})`, e);
    }
    throw fallo(null, `sin respuesta del servidor: ${(e as Error).message}`, e);
  } finally {
    clearTimeout(reloj);
  }
}
