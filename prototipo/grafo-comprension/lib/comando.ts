// comando.ts — la forma de un comando del CLI `grafo`, que el MCP expone tal cual como tool: nombre, qué hace,
// parámetros con tipo, y correr(). Un comando por archivo en comandos/; el índice está en comandos/mod.ts.

import type { Driver } from "neo4j-driver";

export interface Parametro {
  nombre: string;
  tipo: "string" | "integer" | "boolean";
  descripcion: string;
  requerido?: boolean;
}

export interface Comando {
  nombre: string;
  descripcion: string;
  parametros: Parametro[];
  /** Devuelve texto: índice con anclas (archivo:línea, PR, sha), nunca interpretación. */
  correr(args: Record<string, unknown>, db: Driver): Promise<string>;
}

export const sinRuta = (ruta: string, candidatas: string[]): string =>
  candidatas.length
    ? `"${ruta}" no es una ruta exacta. ¿Cuál?\n  ${candidatas.join("\n  ")}`
    : `"${ruta}" no está en el grafo. Probá \`buscar\`.`;
