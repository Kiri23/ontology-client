// cli.ts — valida fichas proyecto.ttl contra el servidor de ontologyLearning.
//
//   deno run --allow-net --allow-read --allow-env cli.ts [--url URL] archivo...
//   deno run --allow-net --allow-read --allow-env jsr:@kiri23/ontology-client/cli archivo...
//
// URL: --url, o ONTOLOGY_URL, o https://ontology.kiri231.com. Token: ONTOLOGY_PROYECTOS_TOKEN, solo por
// entorno (por flag quedaría en el historial y en la lista de procesos).
//
// Exit: 0 todas conforman · 1 alguna no conforma · 2 uso, lectura, red o token.
//
// Con GITHUB_ACTIONS=true, además, cada ficha que no conforma o no se pudo validar deja una anotación
// ::error file=<archivo>:: que GitHub muestra en el PR.

import { parseArgs } from "@std/cli/parse-args";
import { type OpcionesValidar, URL_PRODUCCION, validarProyecto } from "./mod.ts";

const USO = "Uso: deno run --allow-net --allow-read --allow-env cli.ts [--url URL] archivo...\n" +
  "  URL: --url, ONTOLOGY_URL o " + URL_PRODUCCION + ". Token: ONTOLOGY_PROYECTOS_TOKEN.";

// Lo que el CLI toca del mundo: los tests pasan uno en memoria.
export interface Entorno {
  env: (nombre: string) => string | undefined;
  leer: (ruta: string) => Promise<string>;
  fetch?: OpcionesValidar["fetch"];
  out: (linea: string) => void;
  err: (linea: string) => void;
}

// ── anotaciones de GitHub Actions ──
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

/** Corre el CLI con `args` y devuelve el exit code. */
export async function correr(args: string[], entorno: Entorno): Promise<number> {
  let desconocido = "";
  const o = parseArgs(args, {
    string: ["url"],
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
    entorno.out(USO);
    return 0;
  }
  if (desconocido) {
    entorno.err(`Argumento desconocido: ${desconocido}\n${USO}`);
    return 2;
  }
  const archivos = o._.map(String);
  if (archivos.length === 0) {
    entorno.err(`Falta al menos un archivo.\n${USO}`);
    return 2;
  }
  const url = o.url ?? entorno.env("ONTOLOGY_URL") ?? URL_PRODUCCION;
  try {
    new URL(url);
  } catch {
    entorno.err(`La URL del servidor no es válida: ${url}`);
    return 2;
  }
  const token = (entorno.env("ONTOLOGY_PROYECTOS_TOKEN") ?? "").trim();
  if (!token) {
    entorno.err(
      "Falta ONTOLOGY_PROYECTOS_TOKEN: el servidor no valida sin token. En GitHub Actions, pasalo como " +
        "`token: ${{ secrets.ONTOLOGY_PROYECTOS_TOKEN }}`.",
    );
    return 2;
  }
  const enActions = entorno.env("GITHUB_ACTIONS") === "true";

  let noConforman = 0;
  let errores = 0;
  for (const [i, archivo] of archivos.entries()) {
    let turtle: string;
    try {
      turtle = await entorno.leer(archivo);
    } catch (e) {
      errores++;
      entorno.err(`✗ ${archivo}: no pude leerlo (${(e as Error).message})`);
      if (enActions) entorno.out(anotacionError(archivo, "No se pudo leer", (e as Error).message));
      continue;
    }
    const r = await validarProyecto(turtle, { url, token, fetch: entorno.fetch });
    if (r.ok && r.conforma) {
      entorno.out(`✓ ${archivo} conforma`);
    } else if (r.ok) {
      noConforman++;
      entorno.out(`✗ ${archivo} no conforma\n${sangrar(r.reporte)}`);
      if (enActions) entorno.out(anotacionError(archivo, "La ficha no conforma", r.reporte));
    } else {
      errores++;
      const http = r.status === null ? "sin respuesta" : `HTTP ${r.status}`;
      entorno.err(`✗ ${archivo}: ${r.error} (${http}).${pista(r.status)}`);
      if (enActions) entorno.out(anotacionError(archivo, `No se pudo validar (${http})`, r.error + pista(r.status)));
      if (esDelServidor(r.status)) {
        const resto = archivos.length - i - 1;
        if (resto > 0) entorno.err(`Corto acá: las ${resto} fichas que faltan fallarían igual.`);
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
