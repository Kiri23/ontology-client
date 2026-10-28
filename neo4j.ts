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
import { aPuestos, CONSULTA_JOBS, type Fila, prefijosQueFaltan } from "./vista-neo4j.ts";

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
 * `jobs.get()` tira {@link ErrorServidor} con `status: null` si Neo4j no responde, rechaza la auth, no contesta en
 * `timeoutMs` (la espera entera, conexión y reintentos del driver incluidos), si la vista no tiene el centinela de
 * una carga completa (vacía o con una carga cortada a la mitad), si se cargó con otros PREFIJOS, o si un puesto no calza con JobPost (el servidor,
 * con ese dato, daría 503). El error del driver va en `cause`.
 */
export function motorNeo4j(driver: Driver, opciones: OpcionesNeo4j = {}): Motor {
  return {
    nombre: "neo4j",
    jobs: {
      get: async (filtros, { timeoutMs = TIMEOUT_MS } = {}) => {
        try {
          return aPuestos(await conTope(leer(driver, opciones, timeoutMs), timeoutMs), filtros);
        } catch (e) {
          throw new ErrorServidor(null, `neo4j jobs.get: ${(e as Error).message}`, { cause: e });
        }
      },
    },
  };
}

// Las filas de la vista, o un error si no tiene el centinela de una carga completa o se cargó con otros prefijos.
async function leer(driver: Driver, opciones: OpcionesNeo4j, timeoutMs: number): Promise<Fila[]> {
  const sesion = driver.session({ database: opciones.database, defaultAccessMode: neo4j.session.READ });
  try {
    const { records } = await sesion.executeRead((tx) => tx.run(CONSULTA_JOBS), { timeout: timeoutMs });
    if (!(Number(records[0]?.get("cargas")) > 0)) {
      throw new Error("la vista Neo4j no está cargada: deno task neo4j:cargar");
    }
    const faltan = prefijosQueFaltan(records[0].get("prefijos"));
    if (faltan.length) {
      throw new Error(
        `la vista Neo4j se cargó con otros prefijos (le falta ${faltan.join(", ")}), de antes del renombre de ` +
          "namespaces: corré deno task neo4j:cargar",
      );
    }
    return records[0].get("filas") as Fila[];
  } finally {
    await sesion.close();
  }
}

// La promesa, o un error si no termina en `ms`. El timeout de la transacción no cubre la conexión: con el túnel
// caído, el driver reintenta 30 s antes de tirar. El timer se limpia al terminar, como en pedir() (cliente.ts); la
// promesa que pierde la carrera queda con un catch, así su error tardío no es un rechazo sin atender.
async function conTope<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`Neo4j no respondió en ${ms / 1000} s (timeout)`)), ms);
  });
  promesa.catch(() => {});
  try {
    return await Promise.race([promesa, tope]);
  } finally {
    clearTimeout(reloj);
  }
}
