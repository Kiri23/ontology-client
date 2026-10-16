// La AI por el servidor: POST /ai/sparql en el mismo origen (ontologyLearning, vistas/web/ai.py). Recibe los mensajes
// de armarMensajes y contesta {"texto": "…"}, lo que escribió Gemma 4 en Google AI Studio; extraer y validar sigue
// siendo de la página (extraer.ts, el validador). Anda en cualquier navegador: no baja nada ni necesita WebGPU.
// No va por el SDK: /ai/sparql no es una historia del explorador ni está en contrato/openapi.json todavía.
import type { Mensaje } from "./protocolo.ts";

export const RUTA = "/ai/sparql";

/** El pedido no dio texto. El mensaje es para quien preguntó: una frase que dice qué pasó y qué hacer. */
export class FalloDelServidor extends Error {
  override name = "FalloDelServidor";
}

/** Cómo el cliente le pregunta al servidor: así las pruebas le pasan uno falso. */
export type Pedir = (mensajes: Mensaje[], senal: AbortSignal) => Promise<string>;

/** "Google no contestó en 30 s" → "Google no contestó en 30 s.", para cerrar una frase. */
const conPunto = (frase: string) => frase.trim().replace(/\.?$/, ".");

/** "google falló" → "Google falló.": un error de ai.py como frase suelta. */
const oracion = (frase: string) => conPunto(frase.charAt(0).toUpperCase() + frase.slice(1));

/** Los segundos de Retry-After; si no vino o no es un número, un minuto (la ventana del límite). */
function segundos(retryAfter: string | null): number {
  const s = Number(retryAfter);
  return Number.isInteger(s) && s > 0 ? s : 60;
}

/**
 * Qué decir cuando el servidor no dio texto. `error` es el que manda el servidor en el cuerpo ({"error": "…"}); va
 * solo donde ya es corto y en castellano: el 400, el 502 y el 503, que dicen qué le pasó a Google o al servidor.
 * - 502 sin `error` no es de ai.py: es Cloudflare o kiri-edge con el origen caído o en deploy (HTML o texto plano).
 *   Cloudflare además reemplaza el cuerpo de un 502 del origen por su página, así que ai.py no usa 502 para Google.
 * - 503 con `error` es de ai.py: Google falló aun reintentando (con Retry-After) o no hay key. Sin `error`, el 503 no
 *   trae nada que mostrar: queda el mensaje de "no configurada".
 */
export function explicar(estado: number, error: string | undefined, retryAfter: string | null): string {
  if (estado === 429) return `Se llegó al límite de preguntas por minuto: probá de nuevo en ${segundos(retryAfter)} s.`;
  if (estado === 502) return `${error ? conPunto(error) : "El servidor no contestó (502)."} Probá de nuevo en un rato.`;
  if (estado === 503) {
    if (!error) return "La AI no está configurada en el servidor todavía: por ahora no se puede preguntar.";
    const s = Number(retryAfter);
    return `${oracion(error)} Probá de nuevo en ${Number.isInteger(s) && s > 0 ? `${s} s` : "un rato"}.`;
  }
  if (estado === 413) return "La pregunta es demasiado larga: acortala y probá de nuevo.";
  if (estado === 404 || estado === 405) {
    return `Este servidor todavía no tiene Preguntar con AI (${RUTA} dio ${estado}).`;
  }
  if (estado === 400) return `El servidor no aceptó la pregunta${error ? `: ${conPunto(error)}` : "."}`;
  return `El servidor falló (${estado}). Probá de nuevo en un rato.`;
}

/** Le pregunta al servidor y devuelve el texto. Rechaza con FalloDelServidor; un corte de `senal`, con AbortError. */
export async function pedirAlServidor(mensajes: Mensaje[], senal: AbortSignal, buscar = fetch): Promise<string> {
  let respuesta: Response;
  try {
    respuesta = await buscar(RUTA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensajes }),
      signal: senal,
    });
  } catch (e) {
    if (senal.aborted) throw e;
    throw new FalloDelServidor("No se pudo hablar con el servidor: revisá la conexión y probá de nuevo.");
  }
  const cuerpo: unknown = await respuesta.json().catch(() => undefined);
  const campo = (k: string) =>
    typeof cuerpo === "object" && cuerpo !== null && typeof (cuerpo as Record<string, unknown>)[k] === "string"
      ? (cuerpo as Record<string, string>)[k]
      : undefined;
  if (!respuesta.ok) {
    throw new FalloDelServidor(explicar(respuesta.status, campo("error"), respuesta.headers.get("Retry-After")));
  }
  const texto = campo("texto");
  if (texto === undefined) throw new FalloDelServidor("El servidor contestó algo que no es una respuesta de la AI.");
  return texto;
}
