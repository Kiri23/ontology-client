// Tests del CLI: el escapado de anotaciones, correr() con un entorno en memoria y, al final, los exit
// codes del proceso de verdad contra el servidor falso.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { anotacionError, correr, type Entorno, escaparMensaje, escaparPropiedad } from "../cli.ts";
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
  assertStringIncludes(err.join("\n"), "las 1 fichas que faltan");
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
