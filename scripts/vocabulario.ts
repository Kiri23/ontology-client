// vocabulario.ts — genera docs/vocabulary/*.md desde docs/vocabulary.ttl (SKOS): una página por término y un índice.
//
//   deno task vocabulario            valida el TTL y reescribe docs/vocabulary/ (borra las páginas que sobran)
//   deno task vocabulario --check    no escribe: falla (exit 1) si el TTL no valida o si lo commiteado en
//                                    docs/vocabulary/ no es lo que sale del TTL, archivos sobrantes incluidos
//
// docs/vocabulary/ no se edita a mano: cambia el TTL, se regenera, se commitean los dos juntos. CI corre --check.
// Leer, validar, renderizar y el disco viven en scripts/vocabulario/, un archivo cada uno.

import { parseArgs } from "@std/cli/parse-args";
import { leer } from "./vocabulario/leer.ts";
import { validar } from "./vocabulario/validar.ts";
import { renderizar } from "./vocabulario/renderizar.ts";
import { comparar, escribir, leerDirectorio } from "./vocabulario/archivos.ts";

const TTL = new URL("../docs/vocabulary.ttl", import.meta.url);
const DESTINO = new URL("../docs/vocabulary/", import.meta.url);

async function main(): Promise<number> {
  const o = parseArgs(Deno.args, { boolean: ["check", "help"], alias: { h: "help" } });
  if (o.help) {
    console.log("Uso: deno task vocabulario [--check]");
    return 0;
  }
  let conceptos;
  try {
    conceptos = leer(await Deno.readTextFile(TTL));
  } catch (e) {
    console.error(`docs/vocabulary.ttl no es Turtle válido: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
  const errores = validar(conceptos);
  if (errores.length) {
    console.error(`docs/vocabulary.ttl rompe ${errores.length} regla(s):\n${errores.map((e) => `  ${e}`).join("\n")}`);
    return 1;
  }
  const esperado = renderizar(conceptos);
  const actual = await leerDirectorio(DESTINO);
  if (o.check) {
    const diferencias = comparar(actual, esperado);
    if (diferencias.length) {
      console.error(
        `docs/vocabulary/ no coincide con docs/vocabulary.ttl: corré \`deno task vocabulario\` y commiteá.\n${
          diferencias.map((d) => `  ${d}`).join("\n")
        }`,
      );
      return 1;
    }
    console.log(`docs/vocabulary/ está al día con el TTL (${conceptos.length} términos).`);
    return 0;
  }
  await escribir(DESTINO, actual, esperado);
  console.log(`docs/vocabulary/ ← docs/vocabulary.ttl (${conceptos.length} términos)`);
  return 0;
}

if (import.meta.main) Deno.exit(await main());
