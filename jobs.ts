// jobs.ts — la clase JobPost de la ontología, como módulo: `import { jobs } from "@kiri23/ontology-client"`
// y `jobs.get()`, `jobs.descartar()`, `jobs.marcarAplicado()`. Un módulo por clase, no por endpoint: lo que
// el SDK sepa hacer con los puestos vive acá.
//
// El tipo no se escribe a mano. La cadena es: j:JobPostShape (SHACL, en el servidor) → el schema JobPost
// de contrato/openapi.json → components["schemas"]["JobPost"] en generado/api.ts → JobPost acá.
//
// Las acciones (descartar, marcarAplicado) son los action types del servidor: cada una es un
// dash:ModifyAction declarado en su domain/, con su operación en el contrato (jobs_descartar,
// jobs_marcar_aplicado). Los parámetros y el 200 salen de ahí.
//
// POST /jobs (traer puestos nuevos con kiri-jobs) no tiene método: su 200 no declara schema, así que
// devolvería `unknown`. Mientras tanto va por crearCliente().POST("/jobs", ...).

import type { Client, ClientOptions } from "openapi-fetch";
import type { components, operations, paths } from "./generado/api.ts";
import { crearCliente, ErrorServidor, mensajeDeError, TIMEOUT_MS } from "./cliente.ts";

/** Un puesto de trabajo, con la forma de j:JobPostShape: el schema JobPost del contrato. */
export type JobPost = components["schemas"]["JobPost"];

/** Una tecnología que un puesto pide: el schema Technology del contrato. */
export type Technology = components["schemas"]["Technology"];

/** Los filtros de GET /jobs, del contrato: `tecnologia` (python, ts, node…) y `fuente` (remotive, hn). */
export type FiltrosJobs = NonNullable<operations["jobs_get"]["parameters"]["query"]>;

/** El puesto sobre el que corre una acción: el JobPost entero (o cualquier cosa con su `link`), o el link solo. */
export type ReferenciaJob = Pick<JobPost, "link"> | JobPost["link"];

/** Opciones de {@link get}. */
export interface OpcionesJobs {
  /** La URL base del servidor; default https://ontology.kiri231.com. */
  url?: string;
  /** Un fetch propio (tests, proxies). Recibe un Request, como en openapi-fetch. */
  fetch?: ClientOptions["fetch"];
  /** Cuánto esperar la respuesta entera, en milisegundos; default 30 000. */
  timeoutMs?: number;
}

/** Opciones de {@link descartar} y {@link marcarAplicado}: las de {@link get} más el token. */
export interface OpcionesAcciones extends OpcionesJobs {
  /**
   * El token de las acciones (Authorization: Bearer). Sin él, la variable de entorno
   * `ONTOLOGY_ACCIONES_TOKEN` si Deno tiene permiso para leerla; si tampoco está, el pedido va sin token y
   * el servidor responde 401.
   */
  token?: string;
}

/** La variable de entorno de donde sale el token de las acciones cuando no se pasa `token`. */
export const VARIABLE_TOKEN = "ONTOLOGY_ACCIONES_TOKEN";

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
export function get(filtros: FiltrosJobs = {}, opciones: OpcionesJobs = {}): Promise<JobPost[]> {
  return pedir(
    "GET /jobs",
    opciones,
    (cliente, signal) => cliente.GET("/jobs", { params: { query: filtros }, signal }),
    { es: Array.isArray, nombre: "una lista de JobPost" },
  );
}

/**
 * Descarta un puesto: no interesa, y `porque` dice por qué. Devuelve el puesto como queda, con
 * `descartadoEl` y `porque`.
 *
 * ```ts
 * const [puesto] = await jobs.get({ tecnologia: "python" });
 * const descartado = await jobs.descartar(puesto, "pide 5 años de Java", { token });
 * descartado.descartadoEl; // string | undefined: el contrato lo declara opcional
 * ```
 *
 * Tira {@link ErrorServidor}: 400 si el puesto no existe, `porque` está vacío o no se cumple la
 * precondición (`"Ya lo descartaste."`, `"Ya aplicaste a este puesto."`), 401 sin token o con otro, 503 si
 * el servidor no tiene token configurado, `status: null` si no hubo respuesta.
 */
export function descartar(
  job: ReferenciaJob,
  porque: CuerpoDescartar["porque"],
  opciones: OpcionesAcciones = {},
): Promise<JobPost> {
  const body: CuerpoDescartar = { link: linkDe(job), porque };
  return pedir(
    "POST /jobs/descartar",
    opciones,
    (cliente, signal) => cliente.POST("/jobs/descartar", { body, headers: autorizacion(opciones), signal }),
    ES_JOB_POST,
  );
}

/**
 * Marca que se aplicó a un puesto. Devuelve el puesto como queda, con `aplicadoEl`. Uno descartado también
 * se puede marcar.
 *
 * ```ts
 * const aplicado = await jobs.marcarAplicado("https://remotive.com/remote-jobs/…", { token });
 * aplicado.aplicadoEl;
 * ```
 *
 * Tira {@link ErrorServidor} como {@link descartar}: 400 si ya estaba marcado o el puesto no existe, 401,
 * 503, `status: null`.
 */
export function marcarAplicado(job: ReferenciaJob, opciones: OpcionesAcciones = {}): Promise<JobPost> {
  const body: CuerpoMarcarAplicado = { link: linkDe(job) };
  return pedir(
    "POST /jobs/marcar-aplicado",
    opciones,
    (cliente, signal) => cliente.POST("/jobs/marcar-aplicado", { body, headers: autorizacion(opciones), signal }),
    ES_JOB_POST,
  );
}

// Los bodies de las acciones, del contrato.
type CuerpoDescartar = operations["jobs_descartar"]["requestBody"]["content"]["application/json"];
type CuerpoMarcarAplicado = operations["jobs_marcar_aplicado"]["requestBody"]["content"]["application/json"];

// Lo mínimo que se chequea de un 200 antes de devolverlo con su tipo: la forma entera la garantiza el contrato.
interface Forma {
  es: (data: unknown) => boolean;
  nombre: string;
}

const ES_JOB_POST: Forma = {
  es: (data) =>
    typeof data === "object" && data !== null && !Array.isArray(data) &&
    typeof (data as { link?: unknown }).link === "string",
  nombre: "un JobPost",
};

function linkDe(job: ReferenciaJob): string {
  return typeof job === "string" ? job : job.link;
}

// `opciones.token`, o la variable de entorno si Deno puede leerla sin preguntar. Vacío cuenta como no dado.
function tokenDe(opciones: OpcionesAcciones): string | undefined {
  const dado = opciones.token?.trim();
  if (dado) return dado;
  if (typeof Deno === "undefined") return undefined;
  // querySync y no get directo: sin --allow-env, get abre un prompt en una terminal interactiva.
  if (Deno.permissions.querySync({ name: "env", variable: VARIABLE_TOKEN }).state !== "granted") return undefined;
  return Deno.env.get(VARIABLE_TOKEN)?.trim() || undefined;
}

function autorizacion(opciones: OpcionesAcciones): Record<string, string> {
  const token = tokenDe(opciones);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Un pedido con su timeout, y todo lo que no es un 200 de la forma esperada como ErrorServidor: el status
// (o null si no hubo respuesta) y "<etiqueta>: <el {"error"} del servidor>".
async function pedir<D>(
  etiqueta: string,
  opciones: OpcionesJobs,
  llamar: (cliente: Client<paths>, signal: AbortSignal) => Promise<{ data?: D; error?: unknown; response: Response }>,
  forma: Forma,
): Promise<D> {
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
    const { data, error, response } = await llamar(cliente, corte.signal);
    if (!response.ok) {
      throw new ErrorServidor(response.status, `${etiqueta}: ${mensajeDeError(error, response.status)}`);
    }
    if (!forma.es(data)) {
      throw new ErrorServidor(response.status, `${etiqueta}: la respuesta no es ${forma.nombre}: fuera del contrato`);
    }
    return data as D;
  } catch (e) {
    if (e instanceof ErrorServidor) throw e;
    if (corte.signal.aborted) {
      throw new ErrorServidor(null, `${etiqueta}: el servidor no respondió en ${timeoutMs / 1000} s (timeout)`);
    }
    if (status !== null) {
      throw new ErrorServidor(status, `${etiqueta}: la respuesta no es JSON: fuera del contrato`, { cause: e });
    }
    throw new ErrorServidor(null, `${etiqueta}: sin respuesta del servidor: ${(e as Error).message}`, { cause: e });
  } finally {
    clearTimeout(reloj);
  }
}
