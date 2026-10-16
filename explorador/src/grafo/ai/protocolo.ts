// Lo que se dicen la página y el worker de la AI (worker.ts). Un solo archivo para los dos lados: si un mensaje cambia,
// tsc lo marca en ambos.

/** El modelo: Gemma 4 E2B en ONNX, texto solo (docs/gemma-en-el-navegador.md). */
export const MODELO = "onnx-community/gemma-4-E2B-it-ONNX";

/** Lo que baja la primera vez con `q4f16` y texto solo: decoder 1 520 MB + embed_tokens 1 591 MB + tokenizer 19 MB. */
export const BYTES_DEL_MODELO = 3_130_000_000;

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export type APagina =
  /** Si hay adaptador WebGPU en el worker. Sin WebGPU no hay plan B: por WASM no entra en memoria. */
  | { tipo: "check"; webgpu: boolean; motivo?: string }
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
