// grafo.ts — el CLI del grafo de comprensión: un comando por archivo en comandos/, mismo motor que mcp.ts.
//
//   doppler run -p ontology -c dev -- deno task grafo <comando> [args] [--flag valor]
//   doppler run -p ontology -c dev -- deno task grafo archivo Nodo.tsx
//   doppler run -p ontology -c dev -- deno task grafo backtracking Nodo.tsx --profundidad 2
//
// Los parámetros requeridos van posicionales en orden; los opcionales como --nombre valor. `grafo` solo lista los
// comandos; `grafo <comando> --help` muestra sus parámetros.

import { parseArgs } from "@std/cli/parse-args";
import { COMANDOS } from "./comandos/mod.ts";
import { abrir } from "./lib/db.ts";

const ayuda = () =>
  [
    "grafo <comando> [args]  —  el grafo de comprensión de ontology-client",
    "",
    ...COMANDOS.map((c) => {
      const firma = c.parametros.map((p) => (p.requerido ? `<${p.nombre}>` : `[--${p.nombre} ${p.tipo}]`)).join(" ");
      return `  ${c.nombre} ${firma}\n      ${c.descripcion}`;
    }),
  ].join("\n");

const args = parseArgs(Deno.args, { boolean: ["help"] });
const nombre = String(args._[0] ?? "");
const comando = COMANDOS.find((c) => c.nombre === nombre);
if (!comando) {
  console.log(ayuda());
  Deno.exit(nombre ? 1 : 0);
}
if (args.help) {
  console.log(`${comando.nombre}: ${comando.descripcion}\n`);
  for (const p of comando.parametros) {
    console.log(`  ${p.requerido ? "" : "--"}${p.nombre} (${p.tipo})  ${p.descripcion}`);
  }
  Deno.exit(0);
}
const valores: Record<string, unknown> = {};
const posicionales = (args._ as (string | number)[]).slice(1).map(String);
for (const p of comando.parametros) {
  if (args[p.nombre] !== undefined) valores[p.nombre] = args[p.nombre];
  else if (posicionales.length) valores[p.nombre] = posicionales.shift();
}
// Un texto con espacios dado como varios argumentos (grafo buscar vista grafo) se junta en el primer parámetro string.
const primero = comando.parametros[0];
if (primero?.tipo === "string" && posicionales.length) {
  valores[primero.nombre] = [valores[primero.nombre], ...posicionales].join(" ");
}

const db = abrir();
try {
  console.log(await comando.correr(valores, db));
} finally {
  await db.close();
}
