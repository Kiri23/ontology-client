// Tests del CLI: el escapado de anotaciones, correr() con un entorno en memoria y, al final, los exit
// codes del proceso de verdad contra el servidor falso.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { anotacionError, correr, type Entorno, escaparMensaje, escaparPropiedad, neutralizarComandos } from "../cli.ts";
import { URL_PRODUCCION } from "../mod.ts";
import { servidorMudo } from "./servidor-mudo.ts";
import { atenderFalso, MARCA_NO_CONFORMA, servidorFalso } from "./servidor-falso.ts";

const CONFORME = "@prefix k: <https://kiri23.dev/catalogo#> .\nk:x a k:Proyecto .\n";
const NO_CONFORME = CONFORME + MARCA_NO_CONFORMA + "\n";

// ── escapado ──

Deno.test("escaparMensaje: %, \\r y \\n", () => {
  assertEquals(escaparMensaje("100%\r\nlínea 2\nfin"), "100%25%0D%0Alínea 2%0Afin");
  // % primero: si no, el %0A recién escrito se volvería %250A
  assertEquals(escaparMensaje("%0A"), "%250A");
});

Deno.test("escaparPropiedad: además : y ,", () => {
  assertEquals(escaparPropiedad("a:b,c%\n"), "a%3Ab%2Cc%25%0A");
});

Deno.test("anotacionError arma el comando entero", () => {
  assertEquals(
    anotacionError("p/proyecto.ttl", "No conforma: x", "línea 1\nlínea 2"),
    "::error file=p/proyecto.ttl,title=No conforma%3A x::línea 1%0Alínea 2",
  );
});

// ── correr() en memoria ──

function entorno(opciones: { env?: Record<string, string>; archivos?: Record<string, string>; token?: string }) {
  const out: string[] = [];
  const err: string[] = [];
  const env = { ONTOLOGY_URL: "http://falso", ONTOLOGY_PROYECTOS_TOKEN: "secreto", ...opciones.env };
  const e: Entorno = {
    env: (n) => env[n as keyof typeof env],
    leer: (ruta) => {
      const t = opciones.archivos?.[ruta];
      return t === undefined ? Promise.reject(new Error("No such file or directory")) : Promise.resolve(t);
    },
    fetch: atenderFalso("token" in opciones ? opciones.token : "secreto"),
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { e, out, err };
}

Deno.test("exit 0: todas conforman", async () => {
  const { e, out } = entorno({ archivos: { "a.ttl": CONFORME, "b.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl", "b.ttl"], e), 0);
  assertEquals(out, ["✓ a.ttl conforma", "✓ b.ttl conforma"]);
});

Deno.test("exit 1: una no conforma, con su reporte y sin anotación fuera de Actions", async () => {
  const { e, out } = entorno({ archivos: { "a.ttl": CONFORME, "b.ttl": NO_CONFORME } });
  assertEquals(await correr(["a.ttl", "b.ttl"], e), 1);
  assertStringIncludes(out.join("\n"), "✗ b.ttl no conforma\n    Conforms: False");
  assertEquals(out.some((l) => l.startsWith("::")), false);
});

Deno.test("en GitHub Actions: anotación ::error con el archivo", async () => {
  const { e, out } = entorno({ env: { GITHUB_ACTIONS: "true" }, archivos: { "dir/proyecto.ttl": NO_CONFORME } });
  assertEquals(await correr(["dir/proyecto.ttl"], e), 1);
  assertEquals(
    out.find((l) => l.startsWith("::error ")),
    "::error file=dir/proyecto.ttl,title=La ficha no conforma::" +
      "Conforms: False%0AResults (1):%0A  la ficha trae la marca de no conforme",
  );
});

Deno.test("exit 2: token malo, y corta en la primera ficha", async () => {
  const { e, err } = entorno({ token: "otro", archivos: { "a.ttl": CONFORME, "b.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl", "b.ttl"], e), 2);
  assertStringIncludes(err.join("\n"), "HTTP 401");
  assertStringIncludes(err.join("\n"), "Revisá ONTOLOGY_PROYECTOS_TOKEN");
  assertStringIncludes(err.join("\n"), "Corto acá: la ficha que falta fallaría igual.");
});

Deno.test("exit 2: sin token, mensaje claro y sin tocar la red", async () => {
  const { e, err } = entorno({ env: { ONTOLOGY_PROYECTOS_TOKEN: "  " }, archivos: { "a.ttl": CONFORME } });
  e.fetch = () => Promise.reject(new Error("no debería llamar"));
  assertEquals(await correr(["a.ttl"], e), 2);
  assertStringIncludes(err[0], "Falta ONTOLOGY_PROYECTOS_TOKEN");
});

Deno.test("exit 2: sin archivos, o archivo que no existe", async () => {
  const { e } = entorno({ archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr([], e), 2);
  assertEquals(await correr(["a.ttl", "no-existe.ttl"], e), 2);
});

Deno.test("exit 2: flag desconocido o URL inválida", async () => {
  const { e } = entorno({ archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr(["--verbose", "a.ttl"], e), 2);
  assertEquals(await correr(["--url", "no es url", "a.ttl"], e), 2);
});

Deno.test("exit 2: red caída", async () => {
  const { e, err } = entorno({ archivos: { "a.ttl": CONFORME } });
  e.fetch = () => Promise.reject(new TypeError("connection refused"));
  assertEquals(await correr(["a.ttl"], e), 2);
  assertStringIncludes(err.join("\n"), "sin respuesta");
});

Deno.test("--url le gana a ONTOLOGY_URL", async () => {
  const { e } = entorno({ archivos: { "a.ttl": CONFORME } });
  let url = "";
  const atender = atenderFalso("secreto");
  e.fetch = (pedido: Request) => {
    url = pedido.url;
    return atender(pedido);
  };
  assertEquals(await correr(["--url", "http://otro:9/", "a.ttl"], e), 0);
  assertEquals(url, "http://otro:9/proyectos");
});

Deno.test("exit 2 le gana a exit 1: una no conforma y otra no se pudo validar (400, sigue con las demás)", async () => {
  const { e, out, err } = entorno({ archivos: { "a.ttl": NO_CONFORME, "b.ttl": "  \n", "c.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl", "b.ttl", "c.ttl"], e), 2);
  assertStringIncludes(out.join("\n"), "✗ a.ttl no conforma");
  assertStringIncludes(err.join("\n"), "✗ b.ttl:");
  assertStringIncludes(out.join("\n"), "✓ c.ttl conforma"); // un 400 es de la ficha: no corta
});

Deno.test("la anotación de un error lleva el mismo punto que stderr", async () => {
  const { e, out } = entorno({ env: { GITHUB_ACTIONS: "true" }, token: "otro", archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl"], e), 2);
  assertEquals(
    out.find((l) => l.startsWith("::error ")),
    "::error file=a.ttl,title=No se pudo validar (HTTP 401)::falta el token o no es el correcto (HTTP 401). " +
      "Revisá ONTOLOGY_PROYECTOS_TOKEN.",
  );
});

// ── workflow commands desde la ficha ──

// El runner parte en \n, \r o \r\n, quita el blanco inicial (TrimStart de .NET) y ejecuta lo que empieza con ::
const esComando = (linea: string) => /^[\s\u0085]*::/.test(linea);
const lineas = (salida: string[]) => salida.flatMap((s) => s.split(/\r\n|\r|\n/));

Deno.test("neutralizarComandos: solo toca las líneas que el runner ejecutaría", () => {
  assertEquals(neutralizarComandos("  ::warning::x"), "  \u200b::warning::x");
  assertEquals(neutralizarComandos("a\r::add-mask::b"), "a\n\u200b::add-mask::b");
  assertEquals(neutralizarComandos("\u0085\t::stop-commands::t"), "\u0085\t\u200b::stop-commands::t");
  assertEquals(neutralizarComandos("Result Path: k:x :: nada"), "Result Path: k:x :: nada");
});

Deno.test("en Actions, un reporte con ::comandos no inyecta nada; solo sale nuestra anotación", async () => {
  const reporte =
    'Value Node: Literal("x\n::warning title=inyectado::desde la ficha\r  ::add-mask::algo\n\t::stop-commands::t")';
  const malicioso = (status: number, cuerpo: unknown) => () => Promise.resolve(Response.json(cuerpo, { status }));
  for (const fetch of [malicioso(200, { conforma: false, reporte }), malicioso(400, { error: reporte })]) {
    const { e, out, err } = entorno({ env: { GITHUB_ACTIONS: "true" }, archivos: { "a.ttl": CONFORME } });
    e.fetch = fetch;
    await correr(["a.ttl"], e);
    const comandos = lineas([...out, ...err]).filter(esComando);
    assertEquals(comandos.length, 1, comandos.join("\n"));
    assertEquals(comandos[0].startsWith("::error file=a.ttl,"), true);
    assertStringIncludes(out.join("\n") + err.join("\n"), "\u200b::warning title=inyectado"); // se ve, no se ejecuta
  }
});

Deno.test("fuera de Actions la salida va tal cual", async () => {
  const { e, out } = entorno({ archivos: { "a.ttl": CONFORME } });
  e.fetch = () => Promise.resolve(Response.json({ conforma: false, reporte: "::warning::x" }));
  assertEquals(await correr(["a.ttl"], e), 1);
  assertStringIncludes(out.join("\n"), "    ::warning::x");
});

// ── timeout y URL ──

Deno.test("timeout: un servidor que nunca responde da exit 2 y corta", async () => {
  const mudo = servidorMudo();
  try {
    const { e, err } = entorno({
      env: { ONTOLOGY_URL: mudo.url },
      archivos: { "a.ttl": CONFORME, "b.ttl": CONFORME },
    });
    e.fetch = undefined; // fetch de verdad, por la red
    const inicio = Date.now();
    assertEquals(await correr(["--timeout", "0.3", "a.ttl", "b.ttl"], e), 2);
    assertEquals(Date.now() - inicio < 5_000, true);
    assertStringIncludes(err.join("\n"), "timeout");
    assertStringIncludes(err.join("\n"), "Corto acá");
  } finally {
    mudo.cerrar();
  }
});

Deno.test("ONTOLOGY_TIMEOUT inválido o --timeout 0: exit 2", async () => {
  const { e } = entorno({ env: { ONTOLOGY_TIMEOUT: "mucho" }, archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl"], e), 2);
  assertEquals(await correr(["--timeout", "0", "a.ttl"], e), 2);
});

Deno.test('URL vacía (url: "" en la action) cae al default', async () => {
  const { e } = entorno({ env: { ONTOLOGY_URL: "" }, archivos: { "a.ttl": CONFORME } });
  let url = "";
  const atender = atenderFalso("secreto");
  e.fetch = (pedido: Request) => {
    url = pedido.url;
    return atender(pedido);
  };
  assertEquals(await correr(["a.ttl"], e), 0);
  assertEquals(await correr(["--url", "", "a.ttl"], e), 0);
  assertEquals(url, `${URL_PRODUCCION}/proyectos`);
});

Deno.test("avisa si el token va por http a un host que no es local", async () => {
  const { e, err } = entorno({ archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl"], e), 0); // ONTOLOGY_URL=http://falso
  assertStringIncludes(err.join("\n"), "el token viaja en claro");
  const local = entorno({ env: { ONTOLOGY_URL: "http://127.0.0.1:9" }, archivos: { "a.ttl": CONFORME } });
  assertEquals(await correr(["a.ttl"], local.e), 0);
  assertEquals(local.err.length, 0);
});

// ── el proceso de verdad ──

Deno.test("exit codes del proceso contra el servidor falso", async () => {
  const servidor = servidorFalso({ token: "prueba" });
  const url = `http://127.0.0.1:${servidor.addr.port}`;
  const ruta = (relativa: string) => new URL(relativa, import.meta.url).pathname;
  const conforme = ruta("./fichas/conforme/proyecto.ttl");
  const noConforme = ruta("./fichas/no-conforme/proyecto.ttl");
  const cli = ruta("../cli.ts");
  const correrProceso = async (token: string, archivo: string) => {
    const { code } = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-net", "--allow-read", "--allow-env", cli, "--url", url, archivo],
      env: { ONTOLOGY_PROYECTOS_TOKEN: token, GITHUB_ACTIONS: "" },
      stdout: "null",
      stderr: "null",
    }).output();
    return code;
  };
  try {
    assertEquals(await correrProceso("prueba", conforme), 0);
    assertEquals(await correrProceso("prueba", noConforme), 1);
    assertEquals(await correrProceso("malo", conforme), 2);
  } finally {
    await servidor.shutdown();
  }
});
