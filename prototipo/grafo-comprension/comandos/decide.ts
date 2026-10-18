// decide.ts — de "quiero que X se vea distinto" al archivo y las líneas que lo deciden: los comportamientos del Grafo
// del explorador (comportamientos.json), con tipo de cambio y anclas.

import type { Comando } from "../lib/comando.ts";
import { leer } from "../lib/db.ts";

export const decide: Comando = {
  nombre: "decide",
  descripcion:
    "Qué archivo y líneas deciden un comportamiento visible del Grafo del explorador (formas, tamaño, colores, " +
    "hover, leyenda, …). Busca por texto en el nombre; sin texto lista todos. Dice el tipo de cambio: dato, estilo, lógica " +
    "o estructura, y si el comportamiento todavía no existe.",
  parametros: [{ nombre: "texto", tipo: "string", descripcion: "parte del nombre del comportamiento" }],
  async correr(args, db) {
    const texto = String(args.texto ?? "").toLowerCase();
    const filas = await leer(
      db,
      `MATCH (c:Comportamiento)-[d:LO_DECIDE]->(a:Archivo)-[:TIENE_ROL]->(r:Rol)
       WHERE $texto = '' OR toLower(c.nombre) CONTAINS $texto
       RETURN c.nombre AS nombre, c.tipo AS tipo, c.existe AS existe,
              collect({ancla: d.ancla, simbolo: d.simbolo, rol: r.nombre}) AS anclas
       ORDER BY nombre`,
      { texto },
    );
    if (!filas.length) return `ningún comportamiento con "${texto}". Corré \`decide\` sin texto para la lista.`;
    return filas.map((c) => {
      const anclas = c.anclas as { ancla: string; simbolo: string; rol: string }[];
      return [
        `${c.nombre}  ·  cambio de tipo ${c.tipo}${c.existe === false ? "  ·  NO EXISTE todavía" : ""}`,
        ...anclas.map((x) => `  ${x.ancla} (${x.rol}) → ${x.simbolo}`),
      ].join("\n");
    }).join("\n\n");
  },
};
