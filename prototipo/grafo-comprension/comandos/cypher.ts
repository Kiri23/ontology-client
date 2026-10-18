// cypher.ts — la salida de emergencia: una consulta Cypher de solo lectura contra el grafo, filas en JSON. El modelo
// (labels, relaciones, firmas) está en la descripción para que el agente la escriba sin mirar la guía.

import type { Comando } from "../lib/comando.ts";
import { leer } from "../lib/db.ts";

export const cypher: Comando = {
  nombre: "cypher",
  descripcion:
    "Consulta Cypher de solo lectura, filas en JSON. Modelo: (:Sistema {nombre})-[:CONTIENE]->(:Folder {ruta})" +
    "-[:CONTIENE]->(:Archivo {ruta, sistema, intencion, lineas, commits})-[:TIENE_ROL]->(:Rol {nombre}); " +
    "(B:Archivo)-[:SIRVE_A {ancla: 'A:línea', soloTipos}]->(A) cuando A importa B; (:Archivo)-[:NACIO_EN|CAMBIO_EN " +
    "{ancla: sha}]->(:PR {numero, titulo, rama}); (:Rol)-[:PUEDE_SERVIR_A]->(:Rol); (:Comportamiento {nombre, tipo, " +
    "existe})-[:LO_DECIDE {ancla: 'ruta:L1-L2', simbolo}]->(:Archivo); (:Alias {nombre})-[:ALIAS_DE]->(:Archivo).",
  parametros: [{
    nombre: "consulta",
    tipo: "string",
    descripcion: "la consulta Cypher (MATCH … RETURN …)",
    requerido: true,
  }],
  async correr(args, db) {
    const consulta = String(args.consulta ?? "");
    if (/\b(create|merge|delete|set|remove|drop|call\s+db\.|load\s+csv)\b/i.test(consulta)) {
      return "solo lectura: la consulta tiene una palabra de escritura.";
    }
    const filas = await leer(db, consulta);
    return filas.length ? filas.map((f) => JSON.stringify(f)).join("\n") : "(sin filas)";
  },
};
