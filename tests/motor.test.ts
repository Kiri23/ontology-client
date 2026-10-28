// Tests de configurar({ motor }) y de motorNeo4j con un Driver falso: no tocan la red. Cada test que cambia el
// motor lo devuelve a motorHttp en un finally: el motor es estado del módulo, y los otros tests asumen el default.

import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import neo4j, { type Driver } from "neo4j-driver";
import { configurar, ErrorServidor, type JobPost, jobs, type Motor, motorHttp } from "../mod.ts";
import { motorNeo4j } from "../neo4j.ts";
import { motorActual } from "../motor.ts";
import { type Fila, PREFIJOS } from "../vista-neo4j.ts";

const PUESTO: JobPost = {
  link: "https://news.ycombinator.com/item?id=1",
  fecha: "2026-10-13T21:03:57+00:00",
  fuente: { link: "https://kiri231.com/fuente/hn", nombre: "Hacker News", url: "https://news.ycombinator.com" },
  pide: [],
  titulo: "Dev",
};

// Un motor que guarda con qué lo llamaron y devuelve [PUESTO].
function motorFalso() {
  const visto: { filtros?: unknown; opciones?: unknown } = {};
  const motor: Motor = {
    nombre: "falso",
    jobs: {
      get: (filtros, opciones) => {
        Object.assign(visto, { filtros, opciones });
        return Promise.resolve([PUESTO]);
      },
    },
  };
  return { motor, visto };
}

// Un Driver que responde `filas` con `cargas` centinelas (default 1: cargada) y los `prefijos` de n10s (default
// PREFIJOS), tira `error`, o no contesta nunca (`colgado`), y guarda cómo le abrieron la sesión y la transacción.
function driverFalso(
  respuesta: {
    filas?: Fila[];
    cargas?: number;
    prefijos?: Record<string, string> | null;
    error?: Error;
    colgado?: boolean;
  },
) {
  const visto: { sesion?: unknown; tx?: unknown; cerrada?: boolean; cypher?: string } = {};
  const driver = {
    session: (config: unknown) => {
      visto.sesion = config;
      return {
        executeRead: (trabajo: (tx: unknown) => Promise<unknown>, config: unknown) => {
          visto.tx = config;
          return trabajo({
            run: (cypher: string) => {
              visto.cypher = cypher;
              if (respuesta.colgado) return new Promise(() => {});
              if (respuesta.error) return Promise.reject(respuesta.error);
              const fila: Record<string, unknown> = {
                cargas: neo4j.int(respuesta.cargas ?? 1),
                prefijos: respuesta.prefijos === undefined
                  ? { ...PREFIJOS, ns0: "https://x.dev/#" }
                  : respuesta.prefijos,
                filas: respuesta.filas ?? [],
              };
              return Promise.resolve({ records: [{ get: (k: string) => fila[k] }] });
            },
          });
        },
        close: () => {
          visto.cerrada = true;
          return Promise.resolve();
        },
      };
    },
  } as unknown as Driver;
  return { driver, visto };
}

const FILA: Fila = {
  link: PUESTO.link,
  titulo: ["Dev"],
  empresa: [],
  empresaTexto: null,
  fuente: [{
    uri: PUESTO.fuente.link,
    rdfs__label: [PUESTO.fuente.nombre],
    urls: [PUESTO.fuente.url!],
    urlTexto: null,
  }],
  fuenteTexto: null,
  fecha: [new neo4j.types.DateTime(2026, 10, 13, 21, 3, 57, 0, 0)],
  descartadoEl: null,
  porque: null,
  aplicadoEl: null,
  pide: [],
};

Deno.test("sin configurar, el motor es HTTP", () => {
  assertStrictEquals(motorActual(), motorHttp);
  assertEquals(motorHttp.nombre, "http");
});

Deno.test("configurar({ motor }): jobs.get() lee del motor configurado, con los filtros y las opciones tal cual", async () => {
  const { motor, visto } = motorFalso();
  configurar({ motor });
  try {
    assertEquals(await jobs.get({ tecnologia: "python" }, { timeoutMs: 5 }), [PUESTO]);
    assertEquals(visto, { filtros: { tecnologia: "python" }, opciones: { timeoutMs: 5 } });
    await jobs.get();
    assertEquals(visto, { filtros: {}, opciones: {} });
  } finally {
    configurar({ motor: motorHttp });
  }
});

Deno.test("con otro motor, las acciones siguen yendo por HTTP a la fuente", async () => {
  const { motor, visto } = motorFalso();
  configurar({ motor });
  const pedidos: string[] = [];
  const fetch = (pedido: Request) => {
    pedidos.push(`${pedido.method} ${pedido.url}`);
    return Promise.resolve(Response.json({ ...PUESTO, descartadoEl: "2026-10-15T00:00:00+00:00", porque: "no" }));
  };
  try {
    await jobs.descartar(PUESTO, "no", { url: "http://localhost:1", token: "t", fetch });
    await jobs.marcarAplicado(PUESTO, { url: "http://localhost:1", token: "t", fetch });
    assertEquals(pedidos, ["POST http://localhost:1/jobs/descartar", "POST http://localhost:1/jobs/marcar-aplicado"]);
    assertEquals(visto, {});
  } finally {
    configurar({ motor: motorHttp });
  }
});

Deno.test("configurar() sin un Motor tira TypeError y deja el motor que había", () => {
  for (const malo of [undefined, null, {}, { jobs: {} }, { jobs: { get: "no" } }]) {
    assertThrows(() => configurar({ motor: malo as unknown as Motor }), TypeError, "tiene que ser un Motor");
  }
  assertThrows(() => configurar(undefined as unknown as { motor: Motor }), TypeError);
  assertStrictEquals(motorActual(), motorHttp);
});

Deno.test("motorNeo4j: lee en una sesión READ con executeRead, con timeoutMs de timeout, y cierra la sesión", async () => {
  const { driver, visto } = driverFalso({ filas: [FILA] });
  const motor = motorNeo4j(driver, { database: "neo4j" });
  assertEquals(motor.nombre, "neo4j");
  assertEquals(await motor.jobs.get({}, { timeoutMs: 1234 }), [PUESTO]);
  assertEquals(visto.sesion, { database: "neo4j", defaultAccessMode: neo4j.session.READ });
  assertEquals(visto.tx, { timeout: 1234 });
  assertEquals(visto.cerrada, true);
  assertEquals(visto.cypher?.includes("OPTIONAL MATCH (c:_Carga {completa: true})"), true);
});

Deno.test("motorNeo4j: sin timeoutMs usa el de HTTP (30 s)", async () => {
  const { driver, visto } = driverFalso({ filas: [] });
  assertEquals(await motorNeo4j(driver).jobs.get({}, {}), []);
  assertEquals(visto.tx, { timeout: 30_000 });
});

Deno.test("motorNeo4j: un error del driver es ErrorServidor con status null y el error en cause; la sesión se cierra", async () => {
  const caido = new Error("Could not perform discovery. No routing servers available.");
  const { driver, visto } = driverFalso({ error: caido });
  const e = await assertRejects(() => motorNeo4j(driver).jobs.get({}, {}), ErrorServidor);
  assertEquals(e.status, null);
  assertEquals(e.message, `neo4j jobs.get: ${caido.message}`);
  assertStrictEquals(e.cause, caido);
  assertEquals(visto.cerrada, true);
});

Deno.test("motorNeo4j: un puesto que no calza con JobPost es ErrorServidor (el servidor daría 503)", async () => {
  const { driver } = driverFalso({ filas: [{ ...FILA, titulo: ["uno", "otro"] }] });
  const e = await assertRejects(() => motorNeo4j(driver).jobs.get({}, {}), ErrorServidor);
  assertEquals(e.status, null);
  assertEquals(e.message, `neo4j jobs.get: ${PUESTO.link} tiene 2 titulo; la forma JobPost pide uno`);
  assertInstanceOf(e.cause, Error);
});

Deno.test("motorNeo4j: una vista sin el centinela de carga completa (vacía o cortada) es un error, no una lista vacía", async () => {
  const { driver, visto } = driverFalso({ cargas: 0, filas: [] });
  const e = await assertRejects(() => motorNeo4j(driver).jobs.get({}, {}), ErrorServidor);
  assertEquals(e.status, null);
  assertEquals(e.message, "neo4j jobs.get: la vista Neo4j no está cargada: deno task neo4j:cargar");
  assertEquals(visto.cerrada, true);
});

// El _NsPrefDef de la vista de producción, cargada el 2026-10-15 (antes del renombre), leído con executeRead.
const PREFIJOS_DEL_15 = {
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  prov: "http://www.w3.org/ns/prov#",
  t: "https://kiri23.dev/tech#",
  dct: "http://purl.org/dc/terms/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  doap: "http://usefulinc.com/ns/doap#",
  j: "https://kiri23.dev/jobs#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  k: "https://kiri23.dev/catalogo#",
};

Deno.test("motorNeo4j: una vista cargada con otros prefijos (antes del renombre) es un error, no una lista vacía", async () => {
  for (const prefijos of [PREFIJOS_DEL_15, null, { ...PREFIJOS, ontologia: "https://kiri23.dev/jobs#" }]) {
    const { driver, visto } = driverFalso({ filas: [], prefijos });
    const e = await assertRejects(() => motorNeo4j(driver).jobs.get({}, {}), ErrorServidor);
    assertEquals(e.status, null);
    assertStringIncludes(
      e.message,
      "la vista Neo4j se cargó con otros prefijos (le falta ontologia (https://kiri231.com/ontologia#)",
    );
    assertStringIncludes(e.message, "de antes del renombre de namespaces: corré deno task neo4j:cargar");
    assertEquals(visto.cerrada, true);
  }
  // Con los de ahora (y uno de más que n10s haya sumado solo), lee.
  const { driver } = driverFalso({ filas: [FILA] });
  assertEquals((await motorNeo4j(driver).jobs.get({}, {})).map((p) => p.link), [PUESTO.link]);
});

Deno.test("motorNeo4j: timeoutMs acota la espera entera, aunque el driver no conteste (túnel caído)", async () => {
  const { driver } = driverFalso({ colgado: true });
  const e = await assertRejects(() => motorNeo4j(driver).jobs.get({}, { timeoutMs: 50 }), ErrorServidor);
  assertEquals([e.status, e.message], [null, "neo4j jobs.get: Neo4j no respondió en 0.05 s (timeout)"]);
});
