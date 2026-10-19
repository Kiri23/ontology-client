// Tests del modo externo de `deno task vocabulario` (scripts/vocabulario/externo.ts): un vocabulario en @es sale con
// títulos en español, un broader a otro vocabulario se nombra con el label del TTL de contexto y su prefijo, Análogos
// junta los términos con el mismo broader aunque vivan en otro vocabulario, y no hay Mentioned in. Los fixtures
// imitan el de Modal, uno de exe y el compartido ambiente: de ontologyLearning. Al final, el proceso de verdad con los
// permisos de la tarea vocabulario:externo (sin --allow-run: ni siquiera puede llamar a git).

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { ajenos, relativa, renderizarExterno, type Turtle } from "../scripts/vocabulario/externo.ts";

const AMBIENTE: Turtle = {
  ruta: "ambiente.ttl",
  texto: `@prefix ambiente: <https://kiri23.dev/ambiente#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
ambiente:vocabulario a skos:ConceptScheme ; skos:prefLabel "Ambientes"@es .
ambiente:entorno-aislado a skos:Concept ; skos:inScheme ambiente:vocabulario ;
  skos:prefLabel "Entorno aislado"@es ; skos:definition "Lo que el código rompe se queda adentro."@es .
ambiente:persistente a skos:Concept ; skos:inScheme ambiente:vocabulario ;
  skos:prefLabel "Persistente"@es ; skos:definition "Lo guardado sobrevive entre corridas."@es .
`,
};

const MODAL: Turtle = {
  ruta: "modal/vocabulary.ttl",
  texto: `@prefix modal: <https://kiri23.dev/vocabulario/modal#> .
@prefix ambiente: <https://kiri23.dev/ambiente#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
modal:vocabulario a skos:ConceptScheme ; skos:prefLabel "Modal"@es ;
  skos:definition "Los términos de Modal."@es ; rdfs:seeAlso <https://modal.com/docs/guide/intro> .
modal:sandbox a skos:Concept ; skos:inScheme modal:vocabulario ;
  skos:prefLabel "Sandbox"@es ; skos:definition "Un contenedor que se crea desde código."@es ;
  skos:broader ambiente:entorno-aislado ;
  skos:example "Correr el código de un agente."@es ;
  rdfs:seeAlso <https://modal.com/docs/guide/sandboxes> .
modal:funcion a skos:Concept ; skos:inScheme modal:vocabulario ;
  skos:prefLabel "Función"@es ; skos:definition "Python que corre en la nube."@es ;
  skos:broader ambiente:entorno-aislado ; skos:related modal:imagen .
modal:imagen a skos:Concept ; skos:inScheme modal:vocabulario ;
  skos:prefLabel "Imagen"@es ; skos:definition "El sistema de archivos con que arranca."@es .
modal:volumen a skos:Concept ; skos:inScheme modal:vocabulario ;
  skos:prefLabel "Volumen"@es ; skos:definition "Un disco que se monta."@es ; skos:broader ambiente:persistente .
`,
};

const EXE: Turtle = {
  ruta: "exe/vocabulary.ttl",
  texto: `@prefix exe: <https://kiri23.dev/vocabulario/exe#> .
@prefix ambiente: <https://kiri23.dev/ambiente#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
exe:vocabulario a skos:ConceptScheme ; skos:prefLabel "exe.dev"@es .
exe:vm a skos:Concept ; skos:inScheme exe:vocabulario ;
  skos:prefLabel "VM"@es ; skos:definition "Una máquina Linux desechable."@es ; skos:broader ambiente:entorno-aislado .
`,
};

function paginas(vocabulario: Turtle, contexto: Turtle[], fuente = "../vocabulary.ttl"): Map<string, string> {
  const r = renderizarExterno(vocabulario, fuente, contexto);
  if ("errores" in r) throw new Error(r.errores.join("\n"));
  return r.archivos;
}

const errores = (vocabulario: Turtle, contexto: Turtle[] = [AMBIENTE]) => {
  const r = renderizarExterno(vocabulario, "../vocabulary.ttl", contexto);
  return "errores" in r ? r.errores : [];
};

Deno.test("externo: un vocabulario en @es sale entero en español, con Ejemplos y Ver también", () => {
  assertEquals(
    paginas(MODAL, [AMBIENTE]).get("sandbox.md"),
    [
      "<!-- Generado desde ../vocabulary.ttl con `deno task vocabulario:externo`. No se edita a mano: cambiá el TTL " +
      "y corré la tarea. -->",
      "",
      "# Sandbox",
      "",
      "Un contenedor que se crea desde código.",
      "",
      "**Ejemplos**",
      "",
      "- Correr el código de un agente.",
      "",
      "**Más general**",
      "",
      "- Entorno aislado (ambiente:)",
      "",
      "**Análogos**",
      "",
      "- [Función](funcion.md) — mismo padre: Entorno aislado (ambiente:)",
      "",
      "**Ver también**",
      "",
      "- <https://modal.com/docs/guide/sandboxes>",
      "",
    ].join("\n"),
  );
});

Deno.test("externo: el índice lleva el label y la definición del skos:ConceptScheme y el link al TTL", () => {
  const indice = paginas(MODAL, [AMBIENTE], "../vocabulary.ttl").get("README.md")!;
  assertStringIncludes(indice, "# Modal\n\nLos términos de Modal.\n\n");
  assertStringIncludes(
    indice,
    "La fuente es [`vocabulary.ttl`](../vocabulary.ttl), un vocabulario SKOS. Ver también: " +
      "<https://modal.com/docs/guide/intro>.\n",
  );
  const orden = [...indice.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
  assertEquals(orden, ["Función", "Imagen", "Sandbox", "Volumen"]);
});

Deno.test("externo: el broader a otro vocabulario se nombra con el label del contexto y su prefijo, sin link", () => {
  const volumen = paginas(MODAL, [AMBIENTE]).get("volumen.md")!;
  assertStringIncludes(volumen, "**Más general**\n\n- Persistente (ambiente:)\n");
  assert(!volumen.includes("Análogos"), "nadie más es persistente");
  assert(!volumen.includes("persistente.md"), "un término de contexto no tiene página");
  assertEquals(paginas(MODAL, [AMBIENTE]).has("persistente.md"), false);
});

Deno.test("externo: el prefijo sale del contexto o del vocabulario; sin ninguno, el término dice su namespace", () => {
  const sinPrefijo = (t: Turtle) => ({
    ...t,
    texto: t.texto.replace("@prefix ambiente: <https://kiri23.dev/ambiente#> .\n", "")
      .replaceAll(/ambiente:([a-z-]+)/g, "<https://kiri23.dev/ambiente#$1>"),
  });
  assertStringIncludes(paginas(sinPrefijo(MODAL), [AMBIENTE]).get("volumen.md")!, "- Persistente (ambiente:)\n");
  assertStringIncludes(paginas(MODAL, [sinPrefijo(AMBIENTE)]).get("volumen.md")!, "- Persistente (ambiente:)\n");
  assertStringIncludes(
    paginas(sinPrefijo(MODAL), [sinPrefijo(AMBIENTE)]).get("volumen.md")!,
    "- Persistente (<https://kiri23.dev/ambiente#>)\n",
  );
});

Deno.test("externo: Análogos cruza de vocabulario — modal:sandbox y exe:vm comparten ambiente:entorno-aislado", () => {
  const sandbox = paginas(MODAL, [AMBIENTE, EXE]).get("sandbox.md")!;
  assertStringIncludes(
    sandbox,
    "**Análogos**\n\n- [Función](funcion.md) — mismo padre: Entorno aislado (ambiente:)\n" +
      "- VM (exe:) — mismo padre: Entorno aislado (ambiente:)\n",
  );
  // Y al revés: exe renderizado con modal de contexto ve los dos términos de Modal.
  const vm = paginas(EXE, [AMBIENTE, MODAL]).get("vm.md")!;
  assertStringIncludes(
    vm,
    "**Análogos**\n\n- Función (modal:) — mismo padre: Entorno aislado (ambiente:)\n" +
      "- Sandbox (modal:) — mismo padre: Entorno aislado (ambiente:)\n",
  );
});

Deno.test("externo: Relacionados en las dos páginas, escrito una vez", () => {
  const p = paginas(MODAL, [AMBIENTE]);
  assertStringIncludes(p.get("funcion.md")!, "**Relacionados**\n\n- [Imagen](imagen.md)\n");
  assertStringIncludes(p.get("imagen.md")!, "**Relacionados**\n\n- [Función](funcion.md)\n");
});

Deno.test("externo: Más específico incluye a los hijos que viven en un vocabulario de contexto", () => {
  const p = paginas(AMBIENTE, [MODAL, EXE]);
  assertStringIncludes(
    p.get("entorno-aislado.md")!,
    "**Más específico**\n\n- Función (modal:)\n- Sandbox (modal:)\n- VM (exe:)\n",
  );
});

Deno.test("externo: nunca hay Mentioned in, ni en inglés ni en español", () => {
  for (const pagina of paginas(MODAL, [AMBIENTE, EXE]).values()) {
    assert(!pagina.includes("Mencionado en") && !pagina.includes("Mentioned in"));
  }
});

Deno.test("externo: un vocabulario en @en sale con los títulos en inglés", () => {
  const en: Turtle = {
    ruta: "x.ttl",
    texto: `@prefix x: <https://example.org/x#> .
@prefix ambiente: <https://kiri23.dev/ambiente#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
x:vocabulario a skos:ConceptScheme ; skos:prefLabel "X"@en .
x:box a skos:Concept ; skos:prefLabel "Box"@en ; skos:definition "A box."@en ; skos:broader ambiente:entorno-aislado .
x:jail a skos:Concept ; skos:prefLabel "Jail"@en ; skos:definition "A jail."@en ; skos:broader ambiente:entorno-aislado .
`,
  };
  const p = paginas(en, [AMBIENTE]);
  assertStringIncludes(p.get("box.md")!, "<!-- Generated from ../vocabulary.ttl by `deno task vocabulario:externo`.");
  assertStringIncludes(p.get("box.md")!, "**Broader**\n\n- Entorno aislado (ambiente:)\n");
  assertStringIncludes(
    p.get("box.md")!,
    "**Analogous**\n\n- [Jail](jail.md) — same parent: Entorno aislado (ambiente:)\n",
  );
  assertStringIncludes(
    p.get("README.md")!,
    "# X\n\nThe source is [`vocabulary.ttl`](../vocabulary.ttl), a SKOS vocabulary.\n",
  );
});

Deno.test("externo: un broader a un término que no está en ningún contexto es error, con el archivo", () => {
  assertEquals(errores(MODAL, []), [
    "modal/vocabulary.ttl: sandbox: skos:broader apunta a https://kiri23.dev/ambiente#entorno-aislado, que no es " +
    "un skos:Concept del vocabulario",
    "modal/vocabulary.ttl: funcion: skos:broader apunta a https://kiri23.dev/ambiente#entorno-aislado, que no es " +
    "un skos:Concept del vocabulario",
    "modal/vocabulary.ttl: volumen: skos:broader apunta a https://kiri23.dev/ambiente#persistente, que no es un " +
    "skos:Concept del vocabulario",
  ]);
  const sinPersistente = { ...AMBIENTE, texto: AMBIENTE.texto.split("ambiente:persistente")[0] };
  assertEquals(errores(MODAL, [sinPersistente]), [
    "modal/vocabulary.ttl: volumen: skos:broader apunta a https://kiri23.dev/ambiente#persistente, que no es un " +
    "skos:Concept del vocabulario ni de los de contexto",
  ]);
});

Deno.test("externo: el idioma y el namespace salen del archivo; un término en otro idioma o namespace es error", () => {
  const mezcla = { ...MODAL, texto: MODAL.texto.replace('"Imagen"@es', '"Image"@en') };
  assertEquals(errores(mezcla), [
    'modal/vocabulary.ttl: imagen: skos:prefLabel "Image" tiene idioma @en; se espera @es',
    "modal/vocabulary.ttl: imagen: tiene 0 skos:prefLabel en @es; tiene que tener exactamente uno",
  ]);
  const fuera = {
    ...MODAL,
    texto: MODAL.texto + '<https://otro.dev/x#y> a skos:Concept ; skos:prefLabel "Y"@es ; skos:definition "D."@es .\n',
  };
  assertEquals(errores(fuera), [
    "modal/vocabulary.ttl: https://otro.dev/x#y: un término tiene que estar en el namespace " +
    "https://kiri23.dev/vocabulario/modal#",
  ]);
});

Deno.test("externo: sin skos:ConceptScheme, en un idioma sin textos o con Turtle roto, no renderiza", () => {
  assertEquals(errores({ ...MODAL, texto: MODAL.texto.replace("a skos:ConceptScheme ;", "") }), [
    "modal/vocabulary.ttl tiene 0 skos:ConceptScheme; tiene que declarar exactamente uno",
  ]);
  assertEquals(errores({ ...EXE, texto: EXE.texto.replaceAll("@es", "@fr") }), [
    "exe/vocabulary.ttl está en @fr; se renderiza en @en o @es",
  ]);
  const roto = errores(MODAL, [{ ruta: "ambiente.ttl", texto: "esto no es turtle" }]);
  assertEquals(roto.length, 1);
  assertStringIncludes(roto[0], "ambiente.ttl no es Turtle válido");
});

Deno.test("ajenos: lo que no empieza con la cabecera de una página generada", () => {
  const actual = new Map([
    ["README.md", "<!-- Generado desde ../vocabulary.ttl …"],
    ["vm.md", "<!-- Generated from ../vocabulary.ttl …"],
    ["vocabulary.ttl", "@prefix …"],
    ["notas.md", "# Mis notas\n"],
  ]);
  assertEquals(ajenos(actual), ["notas.md", "vocabulary.ttl"]);
});

Deno.test("relativa: de la carpeta de salida al TTL", () => {
  const u = (p: string) => new URL(`file://${p}`);
  assertEquals(relativa(u("/v/modal/vocabulary/"), u("/v/modal/vocabulary.ttl")), "../vocabulary.ttl");
  assertEquals(relativa(u("/v/out/"), u("/v/out/x.ttl")), "x.ttl");
  assertEquals(relativa(u("/a/b/c/"), u("/a/x/y.ttl")), "../../x/y.ttl");
  assertEquals(relativa(u("/a/mis%20notas/"), u("/a/v.ttl")), "../v.ttl");
});

// El proceso de verdad con los permisos de `deno task vocabulario:externo`: lee el TTL, el contexto y la salida, y
// escribe solo la salida. Sin --allow-run, así un intento de leer la prosa con git fallaría.
async function correr(raiz: string, ...args: string[]) {
  const repo = new URL("..", import.meta.url).pathname;
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--config",
      `${repo}deno.json`,
      `--allow-read=${raiz}`,
      `--allow-write=${raiz}/out`,
      "--allow-env=READABLE_STREAM",
      `${repo}scripts/vocabulario.ts`,
      ...args,
    ],
    cwd: raiz,
    env: { NO_COLOR: "1" },
  }).output();
  const t = new TextDecoder();
  return { code, stdout: t.decode(stdout), stderr: t.decode(stderr) };
}

Deno.test("vocabulario:externo: escribe, --check sale 0 al día y 1 editado, y se niega a pisar archivos ajenos", async () => {
  const raiz = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${raiz}/vocabulary.ttl`, MODAL.texto);
    await Deno.writeTextFile(`${raiz}/ambiente.ttl`, AMBIENTE.texto);
    // Prosa que enlaza una página: en modo externo no cuenta (y sin --allow-run no podría listarla con git).
    await Deno.writeTextFile(`${raiz}/README.md`, "[Sandbox](out/sandbox.md)\n");
    const args = ["--ttl", "vocabulary.ttl", "--context", "ambiente.ttl", "--out", "out"];

    assertEquals((await correr(raiz, ...args, "--check")).code, 1, "sin generar: faltan las páginas");
    const escrito = await correr(raiz, ...args);
    assertEquals(escrito.code, 0, escrito.stderr);
    assertStringIncludes(escrito.stdout, "out ← vocabulary.ttl (4 términos, contexto: ambiente.ttl)");
    const sandbox = await Deno.readTextFile(`${raiz}/out/sandbox.md`);
    assertStringIncludes(sandbox, "- Entorno aislado (ambiente:)\n");
    assertStringIncludes(await Deno.readTextFile(`${raiz}/out/README.md`), "[`vocabulary.ttl`](../vocabulary.ttl)");
    assert(!sandbox.includes("Mentioned in") && !sandbox.includes("Mencionado en"));
    assertEquals((await correr(raiz, ...args, "--check")).code, 0);

    await Deno.writeTextFile(`${raiz}/out/sandbox.md`, "\nA mano.\n", { append: true });
    const editado = await correr(raiz, ...args, "--check");
    assertEquals(editado.code, 1);
    assertStringIncludes(editado.stderr, "sandbox.md: no coincide con lo que sale de vocabulary.ttl");

    await Deno.writeTextFile(`${raiz}/out/notas.md`, "# Mías\n");
    const ajeno = await correr(raiz, ...args);
    assertEquals(ajeno.code, 1);
    assertStringIncludes(ajeno.stderr, "out tiene archivos que no generó este script");
    assertEquals(await Deno.readTextFile(`${raiz}/out/notas.md`), "# Mías\n", "no se borra");
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});

Deno.test("vocabulario:externo: sin --out o fuera de los permisos, sale 1 con un mensaje que dice qué falta", async () => {
  const raiz = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${raiz}/vocabulary.ttl`, MODAL.texto);
    const sinOut = await correr(raiz, "--ttl", "vocabulary.ttl");
    assertEquals(sinOut.code, 1);
    assertStringIncludes(sinOut.stderr, "necesita --ttl y --out");
    const fuera = await correr(raiz, "--ttl", "vocabulary.ttl", "--context", "/etc/hosts", "--out", "out");
    assertEquals(fuera.code, 1);
    assertStringIncludes(fuera.stderr, "VOCABULARIO_LEER");
  } finally {
    await Deno.remove(raiz, { recursive: true });
  }
});
