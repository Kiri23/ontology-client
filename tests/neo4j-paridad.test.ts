// Paridad real: jobs.get() por el motor Neo4j devuelve lo mismo, byte a byte, que GET /jobs de producción. Corre
// solo si se le da una vista Neo4j (opt-in, como el test de producción de jobs.test.ts):
//
//   ssh -N -L 7687:localhost:7687 neo4j-ontology.exe.xyz &
//   doppler run -p ontology -c dev -- deno task neo4j:cargar
//   NEO4J_URL=bolt://localhost:7687 doppler run -p ontology -c dev -- deno task test tests/neo4j-paridad.test.ts
//
// La password es NEO4J_PASSWORD (de Doppler); el usuario, NEO4J_USER o neo4j. Si producción trajo puestos nuevos
// después de la carga, la vista está vieja y el test falla: se recarga y se corre de nuevo.

import { assert, assertEquals } from "@std/assert";
import neo4j from "neo4j-driver";
import { configurar, type FiltrosJobs, jobs, motorHttp } from "../mod.ts";
import { motorNeo4j } from "../neo4j.ts";
import { problemas } from "./esquema.ts";

const URL_NEO4J = Deno.env.get("NEO4J_URL");

for (const filtros of [{}, { tecnologia: "python" }, { fuente: "hn" }] as FiltrosJobs[]) {
  Deno.test({
    name: `paridad: jobs.get(${JSON.stringify(filtros)}) por Neo4j == por HTTP de producción (NEO4J_URL)`,
    ignore: !URL_NEO4J,
    fn: async () => {
      const driver = neo4j.driver(
        URL_NEO4J!,
        neo4j.auth.basic(Deno.env.get("NEO4J_USER") || "neo4j", Deno.env.get("NEO4J_PASSWORD") ?? ""),
      );
      try {
        const http = await jobs.get(filtros);
        configurar({ motor: motorNeo4j(driver) });
        const vista = await jobs.get(filtros);
        assert(http.length > 0, "producción no devolvió ningún puesto: la paridad no probaría nada");
        assertEquals(problemas(vista), []);
        assertEquals(JSON.stringify(vista), JSON.stringify(http));
        console.log(`  ${JSON.stringify(filtros)}: ${vista.length} puestos, idénticos`);
      } finally {
        configurar({ motor: motorHttp });
        await driver.close();
      }
    },
  });
}
