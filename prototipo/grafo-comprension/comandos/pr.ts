// pr.ts — qué hizo el agente en un PR: los archivos que nacieron y los que cambiaron, agrupados por rol, con la intención
// de cada uno. El detalle está en el commit del ancla.

import type { Comando } from "../lib/comando.ts";
import { leer } from "../lib/db.ts";

export const pr: Comando = {
  nombre: "pr",
  descripcion:
    "Qué hizo el agente en un PR: archivos que nacieron y que cambiaron ahí, por rol, con su intención y el " +
    "sha. PR 0 = commits directos a main; -1 = la rama sin mergear. Sin número, lista los PR.",
  parametros: [{ nombre: "numero", tipo: "integer", descripcion: "número del PR" }],
  async correr(args, db) {
    if (args.numero === undefined || args.numero === "") {
      const prs = await leer(
        db,
        `MATCH (p:PR) OPTIONAL MATCH (a:Archivo)-[:NACIO_EN]->(p) OPTIONAL MATCH (b:Archivo)-[:CAMBIO_EN]->(p)
         RETURN p.numero AS n, p.titulo AS titulo, count(DISTINCT a) AS nacidos, count(DISTINCT b) AS cambiados ORDER BY n`,
      );
      return prs.map((p) => `#${p.n}  ${p.titulo}  (${p.nacidos} nacieron, ${p.cambiados} cambiaron)`).join("\n");
    }
    const numero = Number(args.numero);
    const [p] = await leer(db, "MATCH (p:PR {numero: $numero}) RETURN p.titulo AS titulo, p.rama AS rama", { numero });
    if (!p) return `no hay PR #${numero}. Corré \`pr\` sin número para la lista.`;
    const filas = await leer(
      db,
      `MATCH (a:Archivo)-[x:NACIO_EN|CAMBIO_EN]->(:PR {numero: $numero}), (a)-[:TIENE_ROL]->(r:Rol)
       RETURN type(x) AS que, r.nombre AS rol, a.ruta AS ruta, a.intencion AS intencion, x.ancla AS sha
       ORDER BY que DESC, rol, ruta`,
      { numero },
    );
    const salida = [`PR #${numero} ${p.titulo} (rama ${p.rama}): ${filas.length} archivos`];
    let grupo = "";
    for (const f of filas) {
      const g = `${f.que === "NACIO_EN" ? "nacieron" : "cambiaron"} · ${f.rol}`;
      if (g !== grupo) salida.push(``, `${g}:`), grupo = g;
      salida.push(`  ${f.ruta} @ ${String(f.sha).slice(0, 7)}${f.intencion ? `  — ${f.intencion}` : ""}`);
    }
    return salida.join("\n");
  },
};
