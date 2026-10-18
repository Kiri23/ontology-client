// backtracking.ts — todo lo que le sirve a un archivo, transitivo: si toco X, qué hay debajo. Por nivel, con el camino
// de anclas. Sin los imports de solo tipos salvo --conTipos: cierran ciclos y traen 53 archivos en vez de 13.

import { type Comando, sinRuta } from "../lib/comando.ts";
import { leer, resolverRuta } from "../lib/db.ts";

export const backtracking: Comando = {
  nombre: "backtracking",
  descripcion: "Qué le sirve a un archivo, transitivo (sus imports, los imports de esos, …) hasta una profundidad. " +
    "Cada archivo con el nivel y el camino de anclas archivo:línea. Sin imports de solo tipos salvo conTipos=true.",
  parametros: [
    { nombre: "ruta", tipo: "string", descripcion: "ruta del archivo o su sufijo", requerido: true },
    { nombre: "profundidad", tipo: "integer", descripcion: "niveles hacia abajo, 1 a 8 (default 3)" },
    { nombre: "conTipos", tipo: "boolean", descripcion: "incluir los imports de solo tipos (default false)" },
  ],
  async correr(args, db) {
    const pedida = String(args.ruta ?? "");
    const rutas = await resolverRuta(db, pedida);
    if (rutas.length !== 1) return sinRuta(pedida, rutas);
    const n = Math.min(8, Math.max(1, Number(args.profundidad ?? 3) || 3));
    const conTipos = args.conTipos === true || args.conTipos === "true";
    // El tope del camino variable no puede ser parámetro en Cypher: va interpolado, ya acotado a 1..8.
    const filas = await leer(
      db,
      `MATCH p = (b:Archivo)-[:SIRVE_A*1..${n}]->(:Archivo {ruta: $ruta})
       WHERE $conTipos OR ALL(r IN relationships(p) WHERE NOT coalesce(r.soloTipos, false))
       WITH b, p ORDER BY length(p)
       WITH b, collect(p)[0] AS corto
       MATCH (b)-[:TIENE_ROL]->(r:Rol)
       RETURN b.ruta AS ruta, r.nombre AS rol, length(corto) AS nivel,
              [x IN relationships(corto) | x.ancla] AS anclas
       ORDER BY nivel, ruta`,
      { ruta: rutas[0], conTipos },
    );
    if (!filas.length) return `${rutas[0]} no importa nada del repo${conTipos ? "" : " (sin contar solo tipos)"}.`;
    const porNivel = new Map<number, string[]>();
    for (const f of filas) {
      const nivel = Number(f.nivel);
      const linea = `  ${f.ruta} (${f.rol})  vía ${(f.anclas as string[]).join(" ← ")}`;
      porNivel.set(nivel, [...(porNivel.get(nivel) ?? []), linea]);
    }
    const salida = [
      `${rutas[0]}: ${filas.length} archivos debajo, hasta ${n} niveles${conTipos ? ", con solo tipos" : ""}`,
    ];
    for (const [nivel, lineas] of [...porNivel.entries()].sort((a, b) => a[0] - b[0])) {
      salida.push(``, `nivel ${nivel} (${lineas.length}):`, ...lineas);
    }
    return salida.join("\n");
  },
};
