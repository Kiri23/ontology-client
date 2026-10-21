// Tests de `deno task vocabulario` contra el disco, en un directorio temporal: `escribir` deja docs/vocabulary/
// igual a lo esperado (borra sobrantes), `leerProsa` lee solo lo que git trackea y nunca docs/vocabulary/,
// node_modules, dist ni generado/, y el proceso de verdad sale 0 al día y 1 con un diff, genera lo mismo dos veces y
// cae si la prosa cambió sin regenerar. Cada temporal es un repo git (`git init`), porque la prosa sale de ls-files.
//
// El proceso corre una copia de scripts/vocabulario* dentro del temporal: el script resuelve docs/ relativo a sí
// mismo, así se prueba con sus rutas de siempre sin tocar el docs/ del repo.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { escribir, leerDirectorio } from "../scripts/vocabulario/archivos.ts";
import { enlacesAlVocabulario, leerProsa } from "../scripts/vocabulario/menciones.ts";

// El pre-commit corre con GIT_INDEX_FILE (y a veces GIT_DIR) de este repo exportados: heredados, harían que el git
// de cada temporal liste el índice del repo de verdad. Se borran antes de lanzar cualquier git.
for (const v of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"]) Deno.env.delete(v);

const TTL = `@prefix v: <https://kiri23.dev/vocabulario#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
v:vocabulario a skos:ConceptScheme ; skos:prefLabel "V"@en .
v:rdf a skos:Concept ; skos:inScheme v:vocabulario ; skos:prefLabel "RDF"@en ; skos:definition "A data model."@en .
v:turtle a skos:Concept ; skos:inScheme v:vocabulario ; skos:prefLabel "Turtle"@en ; skos:definition "A syntax for RDF."@en ;
  skos:related v:rdf .
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

async function git(raiz: string, ...args: string[]): Promise<void> {
  const { code, stderr } = await new Deno.Command("git", { args, cwd: raiz }).output();
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`);
}

// Escribe cada ruta → contenido bajo `raiz` (un repo git), creando las carpetas, y los `git add` salvo que
// `trackear` sea false.
async function sembrar(raiz: string, archivos: Record<string, string>, trackear = true): Promise<void> {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    await Deno.mkdir(`${raiz}/${ruta}`.replace(/\/[^/]*$/, ""), { recursive: true });
    await Deno.writeTextFile(`${raiz}/${ruta}`, contenido);
  }
  if (trackear) await git(raiz, "add", "--", ...Object.keys(archivos));
}

Deno.test("leerProsa: solo lo trackeado, y nunca docs/vocabulary/, node_modules, dist ni generado/", async () => {
  const raiz = await Deno.makeTempDir();
  try {
    await git(raiz, "init", "-q");
    await sembrar(raiz, {
      "README.md": "[RDF](docs/vocabulary/rdf.md)",
      "docs/vocabulary/turtle.md": "**Related**\n\n- [RDF](rdf.md)\n",
      "docs/vocabulary/README.md": "- [RDF](rdf.md)\n",
      "explorador/node_modules/x/README.md": "[RDF](../../../docs/vocabulary/rdf.md)",
      "explorador/dist/README.md": "[RDF](../../docs/vocabulary/rdf.md)",
      "generado/docs/x.md": "[RDF](../../docs/vocabulary/rdf.md)",
      "docs/sub/x.md": "[Turtle](../vocabulary/turtle.md)",
      "AGENTS.md": "[RDF](docs/vocabulary/rdf.md)",
    });
    await sembrar(raiz, { "neo4j/README.md": "[RDF](../docs/vocabulary/rdf.md)" }, false);
    const prosa = await leerProsa(new URL(`file://${raiz}/`));
    assertEquals([...prosa.keys()], ["README.md", "docs/sub/x.md"]);
    assertEquals(enlacesAlVocabulario(prosa).map((e) => `${e.archivo} → ${e.slug}`), [
      "README.md → rdf",
      "docs/sub/x.md → turtle",
    ]);
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});

// Un repo de mentira en un temporal con una copia de scripts/vocabulario*, y `correr` para lanzar el script ahí.
async function repoTemporal() {
  const raiz = await Deno.makeTempDir();
  const repo = new URL("..", import.meta.url).pathname;
  const correr = async (...args: string[]) => {
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        `${repo}deno.json`,
        "--allow-read",
        "--allow-run=git",
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
  await Deno.mkdir(`${raiz}/scripts/vocabulario`, { recursive: true });
  await Deno.mkdir(`${raiz}/docs`);
  await Deno.copyFile(`${repo}scripts/vocabulario.ts`, `${raiz}/scripts/vocabulario.ts`);
  for await (const e of Deno.readDir(`${repo}scripts/vocabulario`)) {
    await Deno.copyFile(`${repo}scripts/vocabulario/${e.name}`, `${raiz}/scripts/vocabulario/${e.name}`);
  }
  await Deno.writeTextFile(`${raiz}/docs/vocabulary.ttl`, TTL);
  await git(raiz, "init", "-q");
  return { raiz, correr };
}

Deno.test("deno task vocabulario: --check sale 0 al día y 1 con un .md editado o sobrante", async () => {
  const { raiz, correr } = await repoTemporal();
  try {
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

Deno.test("deno task vocabulario: desde docs/vocabulary/ vacío, generar dos veces da exactamente lo mismo", async () => {
  const { raiz, correr } = await repoTemporal();
  const dir = new URL(`file://${raiz}/docs/vocabulary/`);
  try {
    await sembrar(raiz, { "README.md": "Ver [Turtle](docs/vocabulary/turtle.md)." });
    await Deno.mkdir(dir);
    assertEquals((await leerDirectorio(dir)).size, 0);
    assertEquals((await correr()).code, 0);
    const primera = await leerDirectorio(dir);
    // Trackeadas como en el repo de verdad: si docs/vocabulary/ se leyera, ls-files las daría en la segunda corrida.
    await git(raiz, "add", "docs/vocabulary");
    assertEquals((await correr()).code, 0);
    assertEquals(await leerDirectorio(dir), primera);
    assertStringIncludes(primera.get("rdf.md")!, "**Related**\n\n- [Turtle](turtle.md)\n");
    assert(!primera.get("rdf.md")!.includes("Mentioned in"), "los links de turtle.md e índice a rdf no son prosa");
    assertStringIncludes(primera.get("turtle.md")!, "**Mentioned in**\n\n- [README.md](../../README.md)\n");
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});

Deno.test("deno task vocabulario: --check cae si la prosa cambió sin regenerar, no ve lo sin trackear y un link roto es error", async () => {
  const { raiz, correr } = await repoTemporal();
  try {
    await sembrar(raiz, { "README.md": "# Repo\n" });
    assertEquals((await correr()).code, 0);
    assertEquals((await correr("--check")).code, 0);

    await sembrar(raiz, { "README.md": "# Repo\n\nVer [RDF](docs/vocabulary/rdf.md).\n" });
    const sinRegenerar = await correr("--check");
    assertEquals(sinRegenerar.code, 1);
    assertStringIncludes(sinRegenerar.stderr, "rdf.md: no coincide");
    assertEquals((await correr()).code, 0);
    assertEquals((await correr("--check")).code, 0);

    await sembrar(raiz, { "docs/borrador.md": "[Turtle](../docs/vocabulary/turtle.md)\n" }, false);
    assertEquals((await correr("--check")).code, 0, "un .md sin trackear no cambia la salida");

    await sembrar(raiz, { "docs/guia.md": "Ver [SHACL](vocabulary/shacl.md).\n" });
    const roto = await correr("--check");
    assertEquals(roto.code, 1);
    assertStringIncludes(
      roto.stderr,
      "docs/guia.md:1: el link (vocabulary/shacl.md) apunta a docs/vocabulary/shacl.md",
    );
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});
