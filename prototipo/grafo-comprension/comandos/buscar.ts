// buscar.ts — encontrar el nodo: archivos cuya ruta o primera línea contiene un texto, con rol y sistema.

import type { Comando } from "../lib/comando.ts";
import { leer } from "../lib/db.ts";

export const buscar: Comando = {
  nombre: "buscar",
  descripcion:
    "Archivos cuya ruta o intención (primera línea) contiene un texto, con sistema y rol. Para encontrar la " +
    "ruta exacta antes de `archivo` o `backtracking`.",
  parametros: [{
    nombre: "texto",
    tipo: "string",
    descripcion: "texto a buscar, sin distinguir mayúsculas",
    requerido: true,
  }],
  async correr(args, db) {
    const texto = String(args.texto ?? "").toLowerCase();
    if (!texto) return "decime qué buscar.";
    const filas = await leer(
      db,
      `MATCH (a:Archivo)-[:TIENE_ROL]->(r:Rol)
       WHERE toLower(a.ruta) CONTAINS $texto OR toLower(coalesce(a.intencion, '')) CONTAINS $texto
       RETURN a.ruta AS ruta, a.sistema AS sistema, r.nombre AS rol, a.intencion AS intencion ORDER BY ruta LIMIT 40`,
      { texto },
    );
    if (!filas.length) return `nada contiene "${texto}".`;
    return filas.map((f) => `${f.ruta} (${f.sistema} / ${f.rol})${f.intencion ? `  — ${f.intencion}` : ""}`).join("\n");
  },
};
