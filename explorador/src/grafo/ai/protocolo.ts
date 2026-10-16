// Lo que se dicen la página y el worker de la AI (worker.ts). Un solo archivo para los dos lados: si un mensaje cambia,
// tsc lo marca en ambos.

/** El modelo: Gemma 4 E2B en ONNX, texto solo (docs/gemma-en-el-navegador.md). */
export const MODELO = "onnx-community/gemma-4-E2B-it-ONNX";

/**
 * Cómo se pide el adaptador WebGPU. "compatibility" es WebGPU recortado (el de OpenGL ES): es lo único que Chrome da en
 * el Pixel 10 Pro XL, cuya GPU no pasa como core (docs/webgpu-en-el-pixel-10.md).
 */
export type ModoWebGpu = "core" | "compatibility";

/** Lo que el worker sabe de la GPU después del `check`: con qué modo dio adaptador y si los shaders tienen f16. */
export interface Gpu {
  modo: ModoWebGpu;
  f16: boolean;
}

/**
 * Qué variante del modelo baja y cuánto pesa la primera vez, con texto solo. Los tamaños salen de la API de Hugging Face
 * (`/api/models/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx`, 2026-10-16), más el tokenizer y los .onnx chicos
 * (19 MB):
 * - `q4f16` (pesos de 4 bits, cuentas en f16): decoder 1 520 MB + embed_tokens 1 591 MB = 3,13 GB.
 * - `q4` (pesos de 4 bits, cuentas en f32): decoder 1 864 MB + embed_tokens 1 763 MB = 3,65 GB. Es la que queda sin
 *   `shader-f16`: un shader de f16 en una GPU sin f16 no compila.
 */
export function eleccionDeCarga({ f16 }: { f16: boolean }): { dtype: "q4f16" | "q4"; bytes: number } {
  return f16 ? { dtype: "q4f16", bytes: 3_130_000_000 } : { dtype: "q4", bytes: 3_646_000_000 };
}

/** Lo que baja la primera vez, según haya f16 o no. */
export const bytesDelModelo = (f16: boolean) => eleccionDeCarga({ f16 }).bytes;

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export type APagina =
  /** Si hay adaptador WebGPU en el worker, y cuál. Sin WebGPU no hay plan B: por WASM no entra en memoria. */
  | ({ tipo: "check"; webgpu: true } & Gpu)
  | { tipo: "check"; webgpu: false; motivo: string }
  /** `cargado` y `total` suman todos los archivos que empezaron a bajar; `archivo` es el último que avanzó. */
  | { tipo: "progreso"; archivo: string; cargado: number; total: number }
  /** Bajado: compila los shaders con un token de prueba. */
  | { tipo: "preparando" }
  | { tipo: "listo" }
  /** Un pedazo de la respuesta, mientras se genera. */
  | { tipo: "token"; texto: string }
  | { tipo: "generado"; texto: string }
  | { tipo: "error"; cuando: "carga" | "generacion"; mensaje: string; nombre?: string };

export type AlWorker =
  | { tipo: "check" }
  | { tipo: "load" }
  | { tipo: "generate"; mensajes: Mensaje[] };
