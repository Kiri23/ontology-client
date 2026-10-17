// Tests de `deno task vocabulario` contra el disco, en un directorio temporal: `escribir` deja docs/vocabulary/
// igual a lo esperado (borra sobrantes) y el proceso de verdad sale 0 al día y 1 con un diff.
//
// El proceso corre una copia de scripts/vocabulario* dentro del temporal: el script resuelve docs/ relativo a sí
// mismo, así se prueba con sus rutas de siempre sin tocar el docs/ del repo.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { escribir, leerDirectorio } from "../scripts/vocabulario/archivos.ts";

const TTL = `@prefix v: <https://kiri23.dev/vocabulario#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
v:rdf a skos:Concept ; skos:prefLabel "RDF"@en ; skos:definition "A data model."@en .
v:turtle a skos:Concept ; skos:prefLabel "Turtle"@en ; skos:definition "A syntax for RDF."@en ; skos:related v:rdf .
`;

Deno.test("escribir: escribe lo esperado y borra lo que sobra", async () => {
  const dir = new URL(`file://${await Deno.makeTempDir()}/vocabulary/`);
  try {
    await Deno.mkdir(dir);
    await Deno.writeTextFile(new URL("viejo.md", dir), "# Viejo\n");
    await Deno.writeTextFile(new URL("rdf.md", dir), "editado a mano\n");
    const esperado = new Map([["README.md", "# Index\n"], ["rdf.md", "# RDF\n"]]);
    await escribir(dir, await leerDirectorio(dir), esperado);
    assertEquals(await leerDirectorio(dir), esperado);
  } finally {
    await Deno.remove(new URL("..", dir), { recursive: true });
  }
});

Deno.test("deno task vocabulario: --check sale 0 al día y 1 con un .md editado o sobrante", async () => {
  const raiz = await Deno.makeTempDir();
  const repo = new URL("..", import.meta.url).pathname;
  const correr = async (...args: string[]) => {
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        `${repo}deno.json`,
        "--allow-read",
        `--allow-write=${raiz}`,
        "--allow-env=READABLE_STREAM",
        `${raiz}/scripts/vocabulario.ts`,
        ...args,
      ],
      env: { NO_COLOR: "1" },
      stdout: "null",
    }).output();
    return { code, stderr: new TextDecoder().decode(stderr) };
  };
  try {
    await Deno.mkdir(`${raiz}/scripts/vocabulario`, { recursive: true });
    await Deno.mkdir(`${raiz}/docs`);
    await Deno.copyFile(`${repo}scripts/vocabulario.ts`, `${raiz}/scripts/vocabulario.ts`);
    for await (const e of Deno.readDir(`${repo}scripts/vocabulario`)) {
      await Deno.copyFile(`${repo}scripts/vocabulario/${e.name}`, `${raiz}/scripts/vocabulario/${e.name}`);
    }
    await Deno.writeTextFile(`${raiz}/docs/vocabulary.ttl`, TTL);

    assertEquals((await correr("--check")).code, 1, "sin generar todavía: faltan las páginas");
    assertEquals((await correr()).code, 0);
    assertEquals((await correr("--check")).code, 0);

    await Deno.writeTextFile(`${raiz}/docs/vocabulary/rdf.md`, "\nUna línea a mano.\n", { append: true });
    const editado = await correr("--check");
    assertEquals(editado.code, 1);
    assertStringIncludes(editado.stderr, "rdf.md: no coincide");

    await correr();
    await Deno.writeTextFile(`${raiz}/docs/vocabulary/viejo.md`, "# Viejo\n");
    const sobrante = await correr("--check");
    assertEquals(sobrante.code, 1);
    assertStringIncludes(sobrante.stderr, "viejo.md: sobra");
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});
