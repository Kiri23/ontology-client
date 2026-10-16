// motor.ts — de dónde lee el SDK, como los backends de base de datos de Django: se elige UNA vez al arrancar,
// con configurar({ motor }), y todo jobs.get() lee de ahí. El default es HTTP (GET /jobs del servidor); quien
// no llama a configurar no nota nada.
//
// Un motor solo lee. Las acciones (jobs.descartar, jobs.marcarAplicado) van siempre por HTTP a la fuente, aun
// con otro motor configurado: escriben en el RDF, y lo demás es una vista de él.
//
//   import { configurar } from "@kiri23/ontology-client";
//   import { motorNeo4j } from "@kiri23/ontology-client/neo4j";
//   configurar({ motor: motorNeo4j(neo4j.driver(url, auth)) });

import type { FiltrosJobs, JobPost, OpcionesJobs } from "./jobs.ts";
import { pedir } from "./cliente.ts";

/** Un motor de lectura: lo que el SDK sabe leer, con las firmas de jobs.get(). */
export interface Motor {
  /** Un nombre para los mensajes: "http", "neo4j". */
  readonly nombre: string;
  jobs: {
    /** Los puestos con la forma y el orden de GET /jobs. */
    get(filtros: FiltrosJobs, opciones: OpcionesJobs): Promise<JobPost[]>;
  };
}

/** El motor por default: GET /jobs del servidor, por HTTP. */
export const motorHttp: Motor = {
  nombre: "http",
  jobs: {
    get: (filtros, opciones) =>
      pedir(
        opciones,
        (cliente, signal) => cliente.GET("/jobs", { params: { query: filtros }, signal }),
        { es: Array.isArray, motivo: "no es una lista de JobPost" },
        "GET /jobs",
      ),
  },
};

let actual: Motor = motorHttp;

/**
 * Elige de dónde lee el SDK. Va una vez, al arrancar; `configurar({ motor: motorHttp })` vuelve al default.
 * Tira `TypeError` si `motor` no es un {@link Motor}.
 */
export function configurar(opciones: { motor: Motor }): void {
  const motor = opciones?.motor;
  if (typeof motor?.jobs?.get !== "function") {
    throw new TypeError("configurar({ motor }): motor tiene que ser un Motor (motorHttp, motorNeo4j(driver)…)");
  }
  actual = motor;
}

/** El motor configurado. */
export function motorActual(): Motor {
  return actual;
}
