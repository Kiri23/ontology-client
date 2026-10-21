// contrato.ts — refresca contrato/openapi.json desde el servidor de ontologyLearning.
//
//   deno task contrato [--url URL]
//
// URL: --url, o ONTOLOGY_CONTRATO_URL, o https://ontology.kiri231.com/openapi.json. El servidor genera
// el contrato desde su registro de comandos: este archivo es una copia, nunca se edita a mano.
// Después de refrescarlo, `deno task generar` rehace los tipos de generado/.

import { parseArgs } from "@std/cli/parse-args";

export const URL_CONTRATO = "https://ontology.kiri231.com/openapi.json";
const DESTINO = new URL("../contrato/openapi.json", import.meta.url);

// El contrato como texto listo para escribir, o el motivo por el que no sirve. Se exige lo que este
// cliente usa: OpenAPI 3.x y las operaciones POST /proyectos y POST /vocabularios.
export function validarContrato(texto: string): { contrato: string } | { error: string } {
  let json: { openapi?: unknown; paths?: Record<string, { post?: unknown }> };
  try {
    json = JSON.parse(texto);
  } catch {
    return { error: "la respuesta no es JSON" };
  }
  if (typeof json.openapi !== "string" || !json.openapi.startsWith("3.")) {
    return { error: "no es un contrato OpenAPI 3.x (falta el campo openapi)" };
  }
  for (const ruta of ["/proyectos", "/vocabularios"]) {
    if (!json.paths?.[ruta]?.post) return { error: `el contrato no tiene POST ${ruta}` };
  }
  // Tal como llegó, sin re-serializar: JSON.parse ordena las claves numéricas ("413" antes que "401" pasa
  // a ser al revés) y el diff contra la copia anterior dejaría de ser el cambio real.
  return { contrato: texto.endsWith("\n") ? texto : texto + "\n" };
}

async function main(): Promise<number> {
  const o = parseArgs(Deno.args, { string: ["url"], boolean: ["help"], alias: { h: "help" } });
  if (o.help) {
    console.log("Uso: deno task contrato [--url URL]  (o ONTOLOGY_CONTRATO_URL)");
    return 0;
  }
  const url = o.url ?? Deno.env.get("ONTOLOGY_CONTRATO_URL") ?? URL_CONTRATO;
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    console.error(`No pude bajar ${url}: ${(e as Error).message}`);
    return 2;
  }
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    console.error(`${url} respondió HTTP ${respuesta.status}`);
    return 2;
  }
  const r = validarContrato(texto);
  if ("error" in r) {
    console.error(`${url}: ${r.error}`);
    return 2;
  }
  await Deno.writeTextFile(DESTINO, r.contrato);
  // El servidor lo manda en una línea. deno fmt lo indenta sin reordenar nada: el diff queda legible.
  const fmt = await new Deno.Command(Deno.execPath(), { args: ["fmt", "--quiet", DESTINO.pathname] }).output();
  if (!fmt.success) {
    console.error(`deno fmt no pudo formatear contrato/openapi.json: ${new TextDecoder().decode(fmt.stderr)}`);
    return 2;
  }
  console.log(`contrato/openapi.json ← ${url}`);
  console.log("Siguiente: deno task generar, y commitear contrato/ y generado/ juntos.");
  return 0;
}

if (import.meta.main) Deno.exit(await main());
