// vocabulario.ts — genera docs/vocabulary/*.md desde docs/vocabulary.ttl (SKOS): una página por término y un índice.
// Cada página lista además qué prosa del repo la enlaza ("Mentioned in"). Con --ttl renderiza cualquier otro
// vocabulary.ttl (el de Modal en el vault, por ejemplo) a la carpeta de --out.
//
//   deno task vocabulario            valida el TTL y los links de la prosa y reescribe docs/vocabulary/ (borra las
//                                    páginas que sobran)
//   deno task vocabulario --check    no escribe: falla (exit 1) si algo no valida o si lo commiteado en
//                                    docs/vocabulary/ no es lo que sale del TTL y la prosa, archivos sobrantes incluidos
//
//   VOCABULARIO_LEER=<ttl>,<contexto…>,<out> VOCABULARIO_ESCRIBIR=<out> \
//     deno task vocabulario:externo --ttl <ttl> --out <out> [--context <ttl>]… [--check]
//                                    lo mismo para un vocabulario externo, en su idioma (en o es), sin Mentioned in.
//                                    Cada --context (domain/ambiente.ttl de ontologyLearning) no lleva páginas: nombra
//                                    los broader y related que cruzan de vocabulario y suma Análogos. Las dos
//                                    variables son los permisos de Deno: la tarea no lee ni escribe nada más.
//
// docs/vocabulary/ no se edita a mano: cambia el TTL o la prosa, se regenera, se commitean juntos. CI corre --check.
// Leer, validar, menciones, renderizar, el disco y el modo externo viven en scripts/vocabulario/, un archivo cada uno.

import { parseArgs } from "@std/cli/parse-args";
// @ts-types="@types/n3"
import { type Quad, Store } from "n3";
import { conceptos as conceptosDe, triples } from "./vocabulario/leer.ts";
import { validar, validarEnlaces, validarEsquema } from "./vocabulario/validar.ts";
import { enlacesAlVocabulario, leerProsa, triplesDeMenciones } from "./vocabulario/menciones.ts";
import { renderizar } from "./vocabulario/renderizar.ts";
import { comparar, escribir, leerDirectorio } from "./vocabulario/archivos.ts";
import { correrExterno } from "./vocabulario/externo.ts";

const RAIZ = new URL("../", import.meta.url);
const TTL = new URL("../docs/vocabulary.ttl", import.meta.url);
const DESTINO = new URL("../docs/vocabulary/", import.meta.url);

const AYUDA = `Uso:
  deno task vocabulario [--check]
      docs/vocabulary.ttl → docs/vocabulary/, con "Mentioned in" de la prosa del repo.

  VOCABULARIO_LEER=<ttl>,<contexto…>,<out> VOCABULARIO_ESCRIBIR=<out> \\
    deno task vocabulario:externo --ttl <ttl> --out <out> [--context <ttl>]… [--check]
      Un vocabulary.ttl cualquiera → <out>/, en el idioma del TTL (en o es), sin "Mentioned in".
      --ttl       el vocabulario a renderizar (declara un skos:ConceptScheme)
      --out       la carpeta de las páginas; solo puede tener páginas generadas por este script
      --context   un TTL cuyos términos no llevan página pero nombran los broader/related que cruzan de vocabulario
                  y suman Análogos; se repite
      Las rutas son absolutas o relativas a la raíz del repo. Las variables son los permisos de lectura y escritura.

  --check     no escribe: sale 1 si la carpeta no es lo que sale del TTL`;

async function main(): Promise<number> {
  const o = parseArgs(Deno.args, {
    boolean: ["check", "help"],
    string: ["ttl", "out", "context"],
    collect: ["context"],
    alias: { h: "help" },
  });
  if (o.help) {
    console.log(AYUDA);
    return 0;
  }
  if (o.ttl !== undefined || o.out !== undefined || o.context.length) {
    if (!o.ttl || !o.out) {
      console.error("Un vocabulario externo necesita --ttl y --out (ver --help).");
      return 1;
    }
    return await correrExterno({ ttl: o.ttl, out: o.out, context: o.context, check: o.check });
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
  const errores = [...validarEsquema(quads), ...validar(conceptos)];
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
