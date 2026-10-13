// cli.ts — valida fichas proyecto.ttl contra el servidor de ontologyLearning.
//
//   deno run --allow-net --allow-read --allow-env cli.ts [--url URL] [--timeout S] archivo...
//   deno run --allow-net --allow-read --allow-env jsr:@kiri23/ontology-client/cli archivo...
//
// URL: --url, o ONTOLOGY_URL, o https://ontology.kiri231.com. Token: ONTOLOGY_PROYECTOS_TOKEN, solo por
// entorno (por flag quedaría en el historial y en la lista de procesos). Timeout por ficha: --timeout, o
// ONTOLOGY_TIMEOUT, en segundos (default 30).
//
// Exit: 0 todas conforman · 1 alguna no conforma · 2 uso, lectura, red, timeout o token. El 2 le gana al
// 1: si una ficha no se pudo validar, el resultado no cubre todas, y "no conforma" no es la respuesta entera.
//
// Con GITHUB_ACTIONS=true, además, cada ficha que no conforma o no se pudo validar deja una anotación
// ::error file=<archivo>:: que GitHub muestra en el PR, y el texto que viene de la ficha o del servidor
// sale neutralizado: no puede colar un workflow command en el log (ver neutralizarComandos).

import { parseArgs } from "@std/cli/parse-args";
import { type OpcionesValidar, TIMEOUT_MS, URL_PRODUCCION, validarProyecto } from "./mod.ts";

const USO = "Uso: deno run --allow-net --allow-read --allow-env cli.ts [--url URL] [--timeout S] archivo...\n" +
  "  URL: --url, ONTOLOGY_URL o " + URL_PRODUCCION + ". Token: ONTOLOGY_PROYECTOS_TOKEN.\n" +
  `  Timeout por ficha en segundos: --timeout u ONTOLOGY_TIMEOUT (default ${TIMEOUT_MS / 1000}).`;

// Lo que el CLI toca del mundo: los tests pasan uno en memoria.
export interface Entorno {
  env: (nombre: string) => string | undefined;
  leer: (ruta: string) => Promise<string>;
  fetch?: OpcionesValidar["fetch"];
  out: (linea: string) => void;
  err: (linea: string) => void;
}

// ── GitHub Actions ──
// https://docs.github.com/actions/reference/workflow-commands-for-github-actions
// El mensaje escapa %, \r y \n; las propiedades (file, title), además, : y , que las separan.

export function escaparMensaje(texto: string): string {
  return texto.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function escaparPropiedad(texto: string): string {
  return escaparMensaje(texto).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

export function anotacionError(archivo: string, titulo: string, mensaje: string): string {
  return `::error file=${escaparPropiedad(archivo)},title=${escaparPropiedad(titulo)}::${escaparMensaje(mensaje)}`;
}

/**
 * El texto de afuera (el reporte, que copia literales de la ficha; los errores del servidor; los nombres de
 * archivo) listo para el log de Actions sin que el runner lo tome como comando. El runner parte la salida
 * en líneas (\n, \r o \r\n), le quita el blanco del principio (TrimStart de .NET, que incluye U+0085) y
 * ejecuta la que empieza con `::`. A esas líneas se les mete un espacio de ancho cero antes del `::`: no es
 * blanco para .NET, así que la línea ya no empieza con `::`, y en el log se ve igual.
 */
export function neutralizarComandos(texto: string): string {
  return texto.split(/\r\n|\r|\n/).map((linea) => linea.replace(/^([\s\u0085]*)::/, "$1\u200b::")).join("\n");
}

// Un error que no depende de la ficha: las que siguen fallarían igual, así que se corta ahí.
function esDelServidor(status: number | null): boolean {
  return status === null || status === 401 || status === 503 || status >= 500;
}

function pista(status: number | null): string {
  if (status === 401) return " Revisá ONTOLOGY_PROYECTOS_TOKEN.";
  if (status === 503) return " El servidor no tiene token configurado.";
  return "";
}

const sangrar = (texto: string) => texto.trimEnd().split("\n").map((l) => `    ${l}`).join("\n");

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Corre el CLI con `args` y devuelve el exit code. */
export async function correr(args: string[], entorno: Entorno): Promise<number> {
  const enActions = entorno.env("GITHUB_ACTIONS") === "true";
  // En Actions todo lo que se imprime pasa por neutralizarComandos; solo anotar() escribe comandos.
  const limpio = (linea: string) => enActions ? neutralizarComandos(linea) : linea;
  const out = (linea: string) => entorno.out(limpio(linea));
  const err = (linea: string) => entorno.err(limpio(linea));
  const anotar = (archivo: string, titulo: string, mensaje: string) => {
    if (enActions) entorno.out(anotacionError(archivo, titulo, mensaje));
  };

  let desconocido = "";
  const o = parseArgs(args, {
    string: ["url", "timeout"],
    boolean: ["help"],
    alias: { h: "help" },
    unknown: (arg) => {
      if (arg.startsWith("-")) {
        desconocido ||= arg;
        return false;
      }
      return true;
    },
  });
  if (o.help) {
    out(USO);
    return 0;
  }
  if (desconocido) {
    err(`Argumento desconocido: ${desconocido}\n${USO}`);
    return 2;
  }
  // Sin los vacíos: `--url ""` deja el "" también entre los posicionales (parseArgs), y no es un archivo.
  const archivos = o._.map(String).filter((a) => a !== "");
  if (archivos.length === 0) {
    err(`Falta al menos un archivo.\n${USO}`);
    return 2;
  }
  // || y no ??: la action pasa `url: ""` como variable vacía, y vacía es "no la dieron".
  const url = o.url || entorno.env("ONTOLOGY_URL") || URL_PRODUCCION;
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    err(`La URL del servidor no es válida: ${url}`);
    return 2;
  }
  const timeoutTexto = o.timeout || entorno.env("ONTOLOGY_TIMEOUT") || "";
  const timeoutS = timeoutTexto === "" ? TIMEOUT_MS / 1000 : Number(timeoutTexto);
  if (!(timeoutS > 0)) {
    err(`El timeout va en segundos y mayor que 0, no ${timeoutTexto}`);
    return 2;
  }
  const token = (entorno.env("ONTOLOGY_PROYECTOS_TOKEN") ?? "").trim();
  if (!token) {
    err(
      "Falta ONTOLOGY_PROYECTOS_TOKEN: el servidor no valida sin token. En GitHub Actions, pasalo como " +
        "`token: ${{ secrets.ONTOLOGY_PROYECTOS_TOKEN }}`.",
    );
    return 2;
  }
  if (destino.protocol === "http:" && !LOCALES.has(destino.hostname)) {
    err(`Aviso: ${destino.host} va por http, sin TLS: el token viaja en claro.`);
  }

  let noConforman = 0;
  let errores = 0;
  for (const [i, archivo] of archivos.entries()) {
    let turtle: string;
    try {
      turtle = await entorno.leer(archivo);
    } catch (e) {
      errores++;
      err(`✗ ${archivo}: no pude leerlo (${(e as Error).message})`);
      anotar(archivo, "No se pudo leer", (e as Error).message);
      continue;
    }
    const r = await validarProyecto(turtle, { url, token, fetch: entorno.fetch, timeoutMs: timeoutS * 1000 });
    if (r.ok && r.conforma) {
      out(`✓ ${archivo} conforma`);
    } else if (r.ok) {
      noConforman++;
      out(`✗ ${archivo} no conforma\n${sangrar(r.reporte)}`);
      anotar(archivo, "La ficha no conforma", r.reporte);
    } else {
      errores++;
      const http = r.status === null ? "sin respuesta" : `HTTP ${r.status}`;
      const mensaje = `${r.error} (${http}).${pista(r.status)}`;
      err(`✗ ${archivo}: ${mensaje}`);
      anotar(archivo, `No se pudo validar (${http})`, mensaje);
      if (esDelServidor(r.status)) {
        const resto = archivos.length - i - 1;
        if (resto === 1) err("Corto acá: la ficha que falta fallaría igual.");
        if (resto > 1) err(`Corto acá: las ${resto} fichas que faltan fallarían igual.`);
        break;
      }
    }
  }
  if (errores > 0) return 2;
  return noConforman > 0 ? 1 : 0;
}

if (import.meta.main) {
  Deno.exit(
    await correr(Deno.args, {
      env: (nombre) => Deno.env.get(nombre),
      leer: (ruta) => Deno.readTextFile(ruta),
      out: (linea) => console.log(linea),
      err: (linea) => console.error(linea),
    }),
  );
}
