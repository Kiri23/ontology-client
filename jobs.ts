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

import type { ClientOptions } from "openapi-fetch";
import type { components, operations } from "./generado/api.ts";
import { type Forma, pedir, URL_PRODUCCION } from "./cliente.ts";
import { motorActual } from "./motor.ts";

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
  /** La URL base del servidor; default https://ontology.kiri231.com. La usan el motor HTTP y las acciones. */
  url?: string;
  /** Un fetch propio (tests, proxies). Recibe un Request, como en openapi-fetch. Lo usan el motor HTTP y las acciones. */
  fetch?: ClientOptions["fetch"];
  /** Cuánto esperar la respuesta entera, en milisegundos; default 30 000. Con Neo4j, el timeout de la transacción. */
  timeoutMs?: number;
}

/** Opciones de {@link descartar} y {@link marcarAplicado}: las de {@link get} más el token. */
export interface OpcionesAcciones extends OpcionesJobs {
  /**
   * El token de las acciones (Authorization: Bearer). Sin él, y solo si `url` es la de producción (o no se
   * pasa), la variable de entorno `ONTOLOGY_ACCIONES_TOKEN` si Deno tiene permiso para leerla. Si no hay
   * ninguno, el pedido va sin token y el servidor responde 401.
   */
  token?: string;
}

/**
 * Los puestos, lo más nuevo primero. Sin filtros, todos. Los lee el motor configurado (motor.ts): por default
 * GET /jobs; con `configurar({ motor: motorNeo4j(driver) })`, la vista Neo4j, con la misma forma y el mismo orden.
 *
 * ```ts
 * const lista = await jobs.get({ tecnologia: "python" });
 * lista[0].pide[0].nombre;
 * ```
 *
 * Tira {@link ErrorServidor} si el servidor no los da: 503 cuando sus datos son de una forma vieja (el
 * mensaje dice cómo rehacerlos), 400, un 200 que no es una lista, red caída o timeout (`status: null`). Con el
 * motor Neo4j, todo error (Neo4j caído, password, un puesto que no calza con JobPost) es `status: null`, con el
 * error del driver en `cause`.
 */
export function get(filtros: FiltrosJobs = {}, opciones: OpcionesJobs = {}): Promise<JobPost[]> {
  return motorActual().jobs.get(filtros, opciones);
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
 * el servidor no tiene token configurado, `status: null` si no hubo respuesta. Tira `TypeError`, sin pedir
 * nada, si `url` no es https (http solo a localhost) o no es una URL.
 */
export async function descartar(
  job: ReferenciaJob,
  porque: CuerpoDescartar["porque"],
  opciones: OpcionesAcciones = {},
): Promise<JobPost> {
  const headers = autorizacion(opciones); // antes del pedido: un error de configuración no se disfraza de red
  const body: CuerpoDescartar = { link: linkDe(job), porque };
  return await pedir(
    opciones,
    (cliente, signal) => cliente.POST("/jobs/descartar", { body, headers, signal }),
    ES_JOB_POST,
    "POST /jobs/descartar",
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
 * 503, `status: null`; y `TypeError` con la misma `url` que {@link descartar} rechaza.
 */
export async function marcarAplicado(job: ReferenciaJob, opciones: OpcionesAcciones = {}): Promise<JobPost> {
  const headers = autorizacion(opciones);
  const body: CuerpoMarcarAplicado = { link: linkDe(job) };
  return await pedir(
    opciones,
    (cliente, signal) => cliente.POST("/jobs/marcar-aplicado", { body, headers, signal }),
    ES_JOB_POST,
    "POST /jobs/marcar-aplicado",
  );
}

// Los bodies de las acciones, del contrato.
type CuerpoDescartar = operations["jobs_descartar"]["requestBody"]["content"]["application/json"];
type CuerpoMarcarAplicado = operations["jobs_marcar_aplicado"]["requestBody"]["content"]["application/json"];

const ES_JOB_POST: Forma = {
  es: (data) =>
    typeof data === "object" && data !== null && !Array.isArray(data) &&
    typeof (data as { link?: unknown }).link === "string",
  motivo: "no es un JobPost",
};

function linkDe(job: ReferenciaJob): string {
  return typeof job === "string" ? job : job.link;
}

const VARIABLE_TOKEN = "ONTOLOGY_ACCIONES_TOKEN";
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// El header Authorization de una acción. Corre antes del pedido y tira TypeError si la url no sirve: https,
// o http solo a localhost (el token no viaja en claro). El token es `opciones.token`; la variable de entorno
// solo para producción, así el token de producción no sale hacia una url que pasó el llamador.
function autorizacion(opciones: OpcionesAcciones): Record<string, string> {
  const destino = new URL(opciones.url || URL_PRODUCCION);
  const local = destino.protocol === "http:" && LOCALES.has(destino.hostname);
  if (destino.protocol !== "https:" && !local) {
    throw new TypeError(
      `${destino.origin}: las acciones van por https (http solo a localhost): el token iría en claro`,
    );
  }
  const deProduccion = destino.origin === new URL(URL_PRODUCCION).origin;
  const token = opciones.token?.trim() || (deProduccion ? tokenDelEntorno() : undefined);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ONTOLOGY_ACCIONES_TOKEN si Deno puede leerla sin preguntar; si no (sin permiso, sin Deno, o un Deno a medias
// sin `permissions`, como un shim), undefined. querySync y no get directo: sin --allow-env, get abre un prompt.
function tokenDelEntorno(): string | undefined {
  try {
    const deno = (globalThis as { Deno?: typeof Deno }).Deno;
    if (deno?.permissions?.querySync?.({ name: "env", variable: VARIABLE_TOKEN }).state !== "granted") return undefined;
    return deno.env?.get?.(VARIABLE_TOKEN)?.trim() || undefined;
  } catch {
    return undefined;
  }
}
