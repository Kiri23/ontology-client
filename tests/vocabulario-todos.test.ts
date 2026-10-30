// Tests de `deno task vocabulario:todos` (scripts/vocabulario/todos.ts): el contexto de cada vocabulario son todos los
// vocabularios de las raíces de raices.json, así agregar uno deja vieja la página de su hermano y una corrida las
// arregla a las dos (lo que pasó con remark y pandoc, Kiri23/ontologyLearning#91). Las carpetas que poda
// core/scanner.py no entran al contexto, un .ttl roto se avisa y una raíz ausente no frena. Corre la tarea de deno.json
// tal cual, en un temporal con un espacio en el nombre.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { esVocabulario, leerRaices } from "../scripts/vocabulario/todos.ts";

const PATRON = `@prefix patron: <https://kiri231.com/vocabulario/patron#> .
@prefix ontologia: <https://kiri231.com/ontologia#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
patron:vocabulario a skos:ConceptScheme , ontologia:VocabularioCompartido ; skos:prefLabel "Patrones"@es .
patron:arquitectura-de-plugins a skos:Concept ; skos:inScheme patron:vocabulario ;
  skos:prefLabel "Arquitectura de plugins"@es ; skos:definition "Un núcleo que se extiende desde afuera."@es .
`;

// Un vocabulario de tecnología con un plugin hijo de patron:arquitectura-de-plugins.
const tecnologia = (n: string) =>
  `@prefix ${n}: <https://kiri231.com/vocabulario/${n}#> .
@prefix patron: <https://kiri231.com/vocabulario/patron#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
${n}:vocabulario a skos:ConceptScheme ; skos:prefLabel "${n}"@es .
${n}:plugin a skos:Concept ; skos:inScheme ${n}:vocabulario ;
  skos:prefLabel "Plugin de ${n}"@es ; skos:definition "Extiende ${n}."@es ; skos:broader patron:arquitectura-de-plugins .
`;

Deno.test("esVocabulario: con ConceptScheme o la marca de compartido sí; un proyecto no; uno roto da el error", () => {
  assertEquals(esVocabulario(PATRON), true);
  assertEquals(esVocabulario(tecnologia("docsify")), true);
  assertEquals(
    esVocabulario(
      `@prefix ontologia: <https://kiri231.com/ontologia#> .\n<x> a ontologia:VocabularioCompartido .\n`,
    ),
    true,
  );
  assertEquals(esVocabulario(`@prefix o: <https://kiri231.com/ontologia#> .\n<x> a o:Proyecto .\n`), false);
  assert(typeof esVocabulario("esto no es turtle") === "string");
});

Deno.test("leerRaices: ~ es el home, una relativa cuelga de la carpeta del archivo", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${dir}/raices.json`,
      JSON.stringify([
        { nombre: "a", ruta: "~/Code/a", device: "pixel", repo: "K/a" },
        { nombre: "b", ruta: "b", device: "pixel", repo: "K/b" },
        { nombre: "c", ruta: "/abs/c", device: "pixel", repo: "K/c" },
      ]),
    );
    assertEquals((await leerRaices(`${dir}/raices.json`, "/home/k")).map((r) => r.ruta), [
      "/home/k/Code/a",
      `${dir}/b`,
      "/abs/c",
    ]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

const REPO = new URL("..", import.meta.url).pathname;

async function todos(...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["task", "--quiet", "--config", `${REPO}deno.json`, "vocabulario:todos", ...args],
    env: { NO_COLOR: "1" },
  }).output();
  const t = new TextDecoder();
  return { code, stdout: t.decode(stdout), stderr: t.decode(stderr) };
}

// Dos raíces: `compartido` (el patrón, más vocabularios en carpetas podadas que no tienen que contar) y `vault`
// (docsify). Una tercera raíz no existe. Devuelve la carpeta del temporal.
async function temporal(): Promise<string> {
  const raiz = `${await Deno.makeTempDir()}/mis notas`;
  const archivo = async (ruta: string, texto: string) => {
    await Deno.mkdir(`${raiz}/${ruta.slice(0, ruta.lastIndexOf("/"))}`, { recursive: true });
    await Deno.writeTextFile(`${raiz}/${ruta}`, texto);
  };
  await archivo("compartido/domain/patron.ttl", PATRON);
  await archivo("compartido/tests/vocabulary.ttl", tecnologia("detest"));
  await archivo("compartido/node_modules/x/vocabulary.ttl", tecnologia("denodo"));
  await archivo("compartido/.oculto/vocabulary.ttl", tecnologia("oculto"));
  await archivo("compartido/roto.ttl", "esto no es turtle");
  await archivo("vault/Vocabularios/docsify/vocabulary.ttl", tecnologia("docsify"));
  await archivo(
    "raices.json",
    JSON.stringify([
      { nombre: "compartido", ruta: "compartido", device: "pixel", repo: "K/c" },
      { nombre: "vault", ruta: "vault", device: "pixel", repo: "K/v" },
      { nombre: "ausente", ruta: "no-esta", device: "pixel", repo: "K/x" },
    ]),
  );
  return raiz;
}

Deno.test("vocabulario:todos: un vocabulario nuevo deja viejo a su hermano y una corrida arregla los dos", async () => {
  const raiz = await temporal();
  const correr = (...extra: string[]) => todos(`${raiz}/vault`, "--raices", `${raiz}/raices.json`, ...extra);
  const plugin = (n: string) => Deno.readTextFile(`${raiz}/vault/Vocabularios/${n}/vocabulary/plugin.md`);
  try {
    const primera = await correr();
    assertEquals(primera.code, 0, primera.stderr);
    assertStringIncludes(primera.stdout, "Contexto: 2 vocabularios");
    assertStringIncludes(primera.stderr, "no-esta");
    assertStringIncludes(primera.stderr, "roto.ttl");
    const sola = await plugin("docsify");
    assertStringIncludes(sola, "- Arquitectura de plugins (patron:)\n");
    assert(!sola.includes("Análogos"), "detest, denodo y oculto están en carpetas podadas");
    assertEquals((await correr("--check")).code, 0);

    // Agregar remark es crear el archivo: --check ve que la página de docsify quedó vieja, no solo que falta remark.
    await Deno.mkdir(`${raiz}/vault/Vocabularios/remark`);
    await Deno.writeTextFile(`${raiz}/vault/Vocabularios/remark/vocabulary.ttl`, tecnologia("remark"));
    const vieja = await correr("--check");
    assertEquals(vieja.code, 1);
    assertStringIncludes(vieja.stderr, "plugin.md: no coincide");
    assertStringIncludes(vieja.stderr, "deno task vocabulario:todos");
    assertStringIncludes(vieja.stderr, "2 de 2 vocabularios");

    assertEquals((await correr()).code, 0);
    assertStringIncludes(await plugin("docsify"), "**Análogos**\n\n- Plugin de remark (remark:) — mismo padre:");
    assertStringIncludes(await plugin("remark"), "**Análogos**\n\n- Plugin de docsify (docsify:) — mismo padre:");
    assertStringIncludes(
      await Deno.readTextFile(`${raiz}/vault/Vocabularios/remark/vocabulary/README.md`),
      "[`vocabulary.ttl`](../vocabulary.ttl)",
    );
    const alDia = await correr("--check");
    assertEquals(alDia.code, 0, alDia.stderr);
    assertStringIncludes(alDia.stdout, "páginas de 2");
  } finally {
    await Deno.remove(`${raiz}/..`, { recursive: true });
  }
});

Deno.test("vocabulario:todos: sin carpeta, con una que no existe o sin vocabularios, sale 1 diciendo qué falta", async () => {
  const raiz = await temporal();
  try {
    const sinCarpeta = await todos("--raices", `${raiz}/raices.json`);
    assertEquals(sinCarpeta.code, 1);
    assertStringIncludes(sinCarpeta.stderr, "al menos una carpeta");
    const noExiste = await todos(`${raiz}/nada`, "--raices", `${raiz}/raices.json`);
    assertEquals(noExiste.code, 1);
    assertStringIncludes(noExiste.stderr, "No existe");
    // compartido tiene vocabularios, pero ninguno es un vocabulary.ttl fuera de las carpetas podadas.
    const vacia = await todos(`${raiz}/compartido`, "--raices", `${raiz}/raices.json`);
    assertEquals(vacia.code, 1);
    assertStringIncludes(vacia.stderr, "Ningún vocabulary.ttl");
    const sinRaices = await todos(`${raiz}/vault`, "--raices", `${raiz}/no.json`);
    assertEquals(sinRaices.code, 1);
    assertStringIncludes(sinRaices.stderr, "No pude leer las raíces");
  } finally {
    await Deno.remove(`${raiz}/..`, { recursive: true });
  }
});
