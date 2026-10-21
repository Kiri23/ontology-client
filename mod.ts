// @kiri23/ontology-client — el cliente HTTP de ontologyLearning: valida proyecto.ttl y vocabulary.ttl y lee
// los puestos de trabajo.
//
// Un módulo por clase de la ontología, no por endpoint, y la capa de abajo queda a la vista:
//
//   crearCliente(opciones)        el Client de openapi-fetch tipado con los paths del contrato
//                                 (generado/api.ts). Es la librería tal cual: .POST, .GET, .use(middleware).
//   validarProyecto(turtle, o)    POST /proyectos con la ficha, y la respuesta reducida a un Resultado.
//   validarVocabulario(turtle, o) POST /vocabularios con el vocabulary.ttl: mismo token, mismo Resultado.
//   jobs.get(filtros?, o?)        GET /jobs: los puestos como JobPost[] (jobs.ts).
//   jobs.descartar(job, porque)   POST /jobs/descartar y POST /jobs/marcar-aplicado (jobs.marcarAplicado):
//                                 las acciones sobre un puesto; devuelven el JobPost como queda.
//   sparql.consultar(q, o?)       GET /sparql: la consulta y la respuesta tal cual ({ tipo, texto }) (sparql.ts).
//   configurar({ motor })         de dónde lee jobs.get(): motorHttp (el default) o motorNeo4j(driver), de
//                                 @kiri23/ontology-client/neo4j (motor.ts). Las acciones van siempre por HTTP.
//
// Los tipos salen del contrato (contrato/openapi.json, que genera el servidor): nada de acá describe
// el endpoint a mano. El motor y las reglas son privados; por HTTP sale solo el reporte.

import type { ClientOptions } from "openapi-fetch";
import type { paths } from "./generado/api.ts";
import { ErrorServidor, type Forma, pedir } from "./cliente.ts";

export type { components, operations, paths } from "./generado/api.ts";
export { crearCliente, ErrorServidor, TIMEOUT_MS, URL_PRODUCCION } from "./cliente.ts";
export * as jobs from "./jobs.ts";
export * as sparql from "./sparql.ts";
export type { OpcionesSparql, RespuestaSparql } from "./sparql.ts";
export { configurar, type Motor, motorHttp } from "./motor.ts";
export type { FiltrosJobs, JobPost, OpcionesAcciones, OpcionesJobs, ReferenciaJob, Technology } from "./jobs.ts";

/** Lo que responde POST /proyectos con 200, tal como lo declara el contrato (POST /vocabularios responde lo mismo). */
export type Validacion = paths["/proyectos"]["post"]["responses"][200]["content"]["application/json"];

/** Las dos puertas que validan un Turtle: la clase del archivo dice cuál. */
export type RutaDeValidacion = "/proyectos" | "/vocabularios";

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

/** Valida una ficha proyecto.ttl contra el servidor (POST /proyectos). Nunca tira: todo vuelve como {@link Resultado}. */
export function validarProyecto(turtle: string, opciones: OpcionesValidar): Promise<Resultado> {
  return validar("/proyectos", turtle, opciones);
}

/**
 * Valida un vocabulary.ttl contra el servidor (POST /vocabularios): las reglas de todo vocabulario SKOS más sus
 * regex (ontologia:patron, ontologia:importa). Mismo token y mismo {@link Resultado} que {@link validarProyecto}. Nunca tira.
 */
export function validarVocabulario(turtle: string, opciones: OpcionesValidar): Promise<Resultado> {
  return validar("/vocabularios", turtle, opciones);
}

async function validar(ruta: RutaDeValidacion, turtle: string, opciones: OpcionesValidar): Promise<Resultado> {
  try {
    const data = await pedir(
      opciones,
      (cliente, signal) =>
        cliente.POST(ruta, {
          body: turtle,
          // openapi-fetch serializa el body a JSON por default: la ficha saldría entre comillas.
          bodySerializer: (ficha: string) => ficha,
          headers: { "Content-Type": "text/turtle; charset=utf-8", Authorization: `Bearer ${opciones.token}` },
          signal,
        }),
      ES_VALIDACION,
    );
    return { ok: true, conforma: data.conforma, reporte: data.reporte };
  } catch (e) {
    // pedir() solo tira ErrorServidor; sin etiqueta, su mensaje es el error tal cual.
    if (e instanceof ErrorServidor) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
}

const ES_VALIDACION: Forma = {
  es: (data) =>
    typeof (data as Partial<Validacion> | undefined)?.conforma === "boolean" &&
    typeof (data as Partial<Validacion>).reporte === "string",
  motivo: "no trae {conforma, reporte}",
};
