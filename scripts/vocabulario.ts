// vocabulario.ts — genera docs/vocabulary/*.md desde docs/vocabulary.ttl (SKOS): una página por término y un índice.
// Cada página lista además qué prosa del repo la enlaza ("Mentioned in").
//
//   deno task vocabulario            valida el TTL y los links de la prosa y reescribe docs/vocabulary/ (borra las
//                                    páginas que sobran)
//   deno task vocabulario --check    no escribe: falla (exit 1) si algo no valida o si lo commiteado en
//                                    docs/vocabulary/ no es lo que sale del TTL y la prosa, archivos sobrantes incluidos
//
// docs/vocabulary/ no se edita a mano: cambia el TTL o la prosa, se regenera, se commitean juntos. CI corre --check.
// Leer, validar, menciones, renderizar y el disco viven en scripts/vocabulario/, un archivo cada uno.

import { parseArgs } from "@std/cli/parse-args";
// @ts-types="@types/n3"
import { type Quad, Store } from "n3";
import { conceptos as conceptosDe, triples } from "./vocabulario/leer.ts";
import { validar, validarEnlaces } from "./vocabulario/validar.ts";
import { enlacesAlVocabulario, leerProsa, triplesDeMenciones } from "./vocabulario/menciones.ts";
import { renderizar } from "./vocabulario/renderizar.ts";
import { comparar, escribir, leerDirectorio } from "./vocabulario/archivos.ts";

const RAIZ = new URL("../", import.meta.url);
const TTL = new URL("../docs/vocabulary.ttl", import.meta.url);
const DESTINO = new URL("../docs/vocabulary/", import.meta.url);

async function main(): Promise<number> {
  const o = parseArgs(Deno.args, { boolean: ["check", "help"], alias: { h: "help" } });
  if (o.help) {
    console.log("Uso: deno task vocabulario [--check]");
    return 0;
  }
  let ttl;
  try {
    ttl = await Deno.readTextFile(TTL);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    console.error("No existe docs/vocabulary.ttl: es la fuente de docs/vocabulary/.");
    return 1;
  }
  let quads: Quad[];
  try {
    quads = triples(ttl);
  } catch (e) {
    console.error(`docs/vocabulary.ttl no es Turtle válido: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
  const conceptos = conceptosDe(quads);
  const errores = validar(conceptos);
  if (errores.length) {
    console.error(`docs/vocabulary.ttl rompe ${errores.length} regla(s):\n${errores.map((e) => `  ${e}`).join("\n")}`);
    return 1;
  }
  const enlaces = enlacesAlVocabulario(await leerProsa(RAIZ));
  const rotos = validarEnlaces(enlaces, conceptos);
  if (rotos.length) {
    console.error(
      `La prosa enlaza ${rotos.length} página(s) del vocabulario que no existen:\n${
        rotos.map((e) => `  ${e}`).join("\n")
      }`,
    );
    return 1;
  }
  const esperado = renderizar(conceptos, new Store([...quads, ...triplesDeMenciones(enlaces)]));
  const actual = await leerDirectorio(DESTINO);
  if (o.check) {
    const diferencias = comparar(actual, esperado);
    if (diferencias.length) {
      console.error(
        `docs/vocabulary/ no coincide con docs/vocabulary.ttl y la prosa que lo enlaza: corré \`deno task vocabulario\` y commiteá.\n${
          diferencias.map((d) => `  ${d}`).join("\n")
        }`,
      );
      return 1;
    }
    console.log(
      `docs/vocabulary/ está al día con el TTL y la prosa (${conceptos.length} términos, ${enlaces.length} links).`,
    );
    return 0;
  }
  await escribir(DESTINO, actual, esperado);
  console.log(
    `docs/vocabulary/ ← docs/vocabulary.ttl (${conceptos.length} términos) + prosa (${enlaces.length} links)`,
  );
  return 0;
}

if (import.meta.main) Deno.exit(await main());
