// capas.ts — las SIRVE_A que van contra la matriz puede-servir-a de roles.json: un archivo de un rol sirviendo a un rol
// al que no debería. La matriz es una propuesta editable; esto lista las excepciones con su ancla.

import type { Comando } from "../lib/comando.ts";
import { leer } from "../lib/db.ts";

export const capas: Comando = {
  nombre: "capas",
  descripcion: "Imports que rompen las capas: SIRVE_A entre dos roles que la matriz puede-servir-a (roles.json) no " +
    "permite. Cada uno con archivo:línea del import y si es solo tipos.",
  parametros: [],
  async correr(_args, db) {
    const filas = await leer(
      db,
      `MATCH (b:Archivo)-[s:SIRVE_A]->(a:Archivo), (b)-[:TIENE_ROL]->(rb:Rol), (a)-[:TIENE_ROL]->(ra:Rol)
       WHERE rb.nombre <> 'Sin rol' AND ra.nombre <> 'Sin rol' AND NOT (rb)-[:PUEDE_SERVIR_A]->(ra)
       RETURN b.ruta AS de, rb.nombre AS rolDe, a.ruta AS a, ra.nombre AS rolA, s.ancla AS ancla, s.soloTipos AS soloTipos
       ORDER BY rolDe, rolA, ancla`,
    );
    if (!filas.length) return "ninguna arista rompe la matriz.";
    return [
      `${filas.length} imports contra la matriz (B sirve a A cuando A importa B):`,
      ...filas.map((f) =>
        `  ${f.de} (${f.rolDe}) → ${f.a} (${f.rolA}) @ ${f.ancla}${f.soloTipos ? " [solo tipos]" : ""}`
      ),
    ].join("\n");
  },
};
