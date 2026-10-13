// generar.ts — genera generado/api.ts (los tipos del contrato) con openapi-typescript.
//
//   deno task generar            reescribe generado/api.ts desde contrato/openapi.json
//   deno task generar --check    no escribe: falla (exit 1) si lo commiteado no es lo que se genera
//
// generado/ no se edita a mano: cambia el contrato, se regenera, se commitean los dos juntos. CI corre
// --check para que no quede un tipo viejo respecto del contrato.

import { parseArgs } from "@std/cli/parse-args";
import openapiTS, { astToString } from "openapi-typescript";

const CONTRATO = new URL("../contrato/openapi.json", import.meta.url);
const DESTINO = new URL("../generado/api.ts", import.meta.url);

const CABECERA = `// GENERADO por scripts/generar.ts desde contrato/openapi.json con openapi-typescript. No editar:
// para cambiarlo, \`deno task contrato\` (o editá el contrato en el servidor) y \`deno task generar\`.

`;

// El contenido de generado/api.ts para el contrato actual.
export async function generar(): Promise<string> {
  const ast = await openapiTS(CONTRATO);
  return CABECERA + astToString(ast);
}

async function main(): Promise<number> {
  const o = parseArgs(Deno.args, { boolean: ["check", "help"], alias: { h: "help" } });
  if (o.help) {
    console.log("Uso: deno task generar [--check]");
    return 0;
  }
  const nuevo = await generar();
  if (o.check) {
    let actual = "";
    try {
      actual = await Deno.readTextFile(DESTINO);
    } catch {
      // sin archivo: cuenta como desactualizado
    }
    if (actual !== nuevo) {
      console.error("generado/api.ts no coincide con contrato/openapi.json: corré `deno task generar` y commiteá.");
      return 1;
    }
    console.log("generado/api.ts está al día con el contrato.");
    return 0;
  }
  await Deno.writeTextFile(DESTINO, nuevo);
  console.log("generado/api.ts ← contrato/openapi.json");
  return 0;
}

if (import.meta.main) Deno.exit(await main());
