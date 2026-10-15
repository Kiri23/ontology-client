// neo4j.ts — el motor Neo4j: `@kiri23/ontology-client/neo4j`. Un entry point aparte, así quien usa solo HTTP no
// baja neo4j-driver.
//
// No envuelve al driver: el consumidor crea su Driver (con su URL, su auth, su config) y lo inyecta. El motor
// solo abre sesiones de lectura sobre él; cerrarlo es cosa de quien lo creó.
//
//   import neo4j from "npm:neo4j-driver@6.2.0";
//   import { configurar, jobs } from "@kiri23/ontology-client";
//   import { motorNeo4j } from "@kiri23/ontology-client/neo4j";
//
//   const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", password));
//   configurar({ motor: motorNeo4j(driver) });
//   await jobs.get({ tecnologia: "python" }); // lo mismo que GET /jobs?tecnologia=python, leído de Neo4j
//
// Neo4j es una vista del RDF (neo4j/README.md): la arma scripts/neo4j-cargar.ts con n10s y nada más escribe en
// ella. Por eso las acciones (jobs.descartar, jobs.marcarAplicado) siguen yendo por HTTP a la fuente.

import neo4j, { type Driver } from "neo4j-driver";
import { ErrorServidor, TIMEOUT_MS } from "./cliente.ts";
import type { Motor } from "./motor.ts";
import { aPuestos, CONSULTA_JOBS, type Fila } from "./vista-neo4j.ts";

export type { Motor } from "./motor.ts";

/** Opciones de {@link motorNeo4j}. */
export interface OpcionesNeo4j {
  /** La base de datos; default la del servidor (en community, `neo4j`). */
  database?: string;
}

/**
 * Un motor que lee los puestos de la vista Neo4j, con la forma y el orden de GET /jobs. Cada lectura va en una
 * transacción de solo lectura (executeRead): una escritura ahí la rechaza el servidor.
 *
 * `jobs.get()` tira {@link ErrorServidor} con `status: null` si Neo4j no responde, rechaza la auth, se pasa de
 * `timeoutMs`, o si un puesto de la vista no calza con JobPost (el servidor, con ese dato, daría 503). El error
 * del driver va en `cause`.
 */
export function motorNeo4j(driver: Driver, opciones: OpcionesNeo4j = {}): Motor {
  return {
    nombre: "neo4j",
    jobs: {
      get: async (filtros, { timeoutMs = TIMEOUT_MS } = {}) => {
        try {
          return aPuestos(await leer(driver, opciones, timeoutMs), filtros);
        } catch (e) {
          throw new ErrorServidor(null, `neo4j jobs.get: ${(e as Error).message}`, { cause: e });
        }
      },
    },
  };
}

async function leer(driver: Driver, opciones: OpcionesNeo4j, timeoutMs: number): Promise<Fila[]> {
  const sesion = driver.session({ database: opciones.database, defaultAccessMode: neo4j.session.READ });
  try {
    const resultado = await sesion.executeRead((tx) => tx.run(CONSULTA_JOBS), { timeout: timeoutMs });
    return resultado.records.map((r) => r.toObject() as unknown as Fila);
  } finally {
    await sesion.close();
  }
}
