// Lo que se dicen la página y el worker de la AI (worker.ts). Un solo archivo para los dos lados: si un mensaje cambia,
// tsc lo marca en ambos.

/** El modelo: Gemma 4 E2B en ONNX, texto solo (docs/gemma-en-el-navegador.md). */
export const MODELO = "onnx-community/gemma-4-E2B-it-ONNX";

/**
 * Cómo se pide el adaptador WebGPU. "compatibility" es WebGPU recortado (el de OpenGL ES): es lo único que Chrome da en
 * el Pixel 10 Pro XL, cuya GPU no pasa como core (docs/webgpu-en-el-pixel-10.md).
 */
export type ModoWebGpu = "core" | "compatibility";

/**
 * Lo que el worker sabe de la GPU después del `check`: con qué modo dio adaptador, si los shaders tienen f16 y el
 * buffer más grande que acepta un shader (de eso depende dónde corren los embeddings).
 */
export interface Gpu {
  modo: ModoWebGpu;
  f16: boolean;
  maxStorageBufferBindingSize: number;
}

/**
 * Qué variante del modelo baja y cuánto pesa la primera vez, con texto solo. Los tamaños salen de la API de Hugging Face
 * (`/api/models/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx`, 2026-10-16), más el tokenizer y los .onnx chicos
 * (19 MB):
 * - `q4f16` (pesos de 4 bits, cuentas en f16): decoder 1 520 MB + embed_tokens 1 591 MB = 3,13 GB.
 * - `q4` (pesos de 4 bits, cuentas en f32): decoder 1 864 MB + embed_tokens 1 763 MB = 3,65 GB. Es la que queda sin
 *   `shader-f16`: un shader de f16 en una GPU sin f16 no compila.
 */
const VARIANTES = {
  q4f16: 3_130_000_000,
  q4: 3_646_000_000,
} as const;

/**
 * El tensor más grande de `embed_tokens`: `model_embed_tokens_per_layer_weight_quant`, u8 [262144, 4480] = 1 174 MB.
 * Pesa lo mismo en `q4` y en `q4f16` (los pesos cuantizados son u8 en los dos). Lo usa `GatherBlockQuantized`, que en
 * WebGPU lo ata entero a un binding; si la GPU no acepta un buffer así (el Pixel acepta 256 MB), la sesión no se crea
 * ("exceeding maxStorageBufferBindingSize of"). Después viene `per_layer_weight_scales`, f32, 293,6 MB. El decoder no
 * pasa de 201 MB (`lm_head`). Revisión del PR #11, con los .onnx de Hugging Face.
 *
 * Mandar `embed_tokens` a wasm no sirve: este build de onnxruntime-web no trae el kernel de CPU de
 * `GatherBlockQuantized` (solo `contrib_ops/webgpu/quantization/gather_block_quantized.cc`; con EP wasm da "Could not
 * find an implementation for GatherBlockQuantized(1)"), y las variantes que usan Gather común (fp16, fp32) pesan 5,5 y
 * 11 GB. Por eso es solo un dato para avisar. El plan B, trabajo aparte: un lookup propio de los embeddings con Range
 * requests sobre `embed_tokens_q4.onnx_data`.
 */
export const TENSOR_MAS_GRANDE_DE_EMBED = 262_144 * 4_480;

/** La variante que eligió el worker al empezar la carga, con los números para avisar si la tabla de embeddings no entra. */
export interface Variante {
  dtype: keyof typeof VARIANTES;
  bytes: number;
  /** La tabla de embeddings supera lo que la GPU acepta por buffer: puede fallar al crear la sesión. */
  embedExcedeBinding: boolean;
  tablaDeEmbed: number;
  maxStorageBufferBindingSize: number;
}

/**
 * Qué variante baja y cuánto pesa. Sin f16 baja `q4` (un shader de f16 no compila en esa GPU). Todo corre en la GPU:
 * `embedExcedeBinding` solo avisa (ver TENSOR_MAS_GRANDE_DE_EMBED).
 */
export function opcionesDeCarga(
  { f16, maxStorageBufferBindingSize }: Pick<Gpu, "f16" | "maxStorageBufferBindingSize">,
): Variante {
  const dtype = f16 ? "q4f16" : "q4";
  return {
    dtype,
    bytes: VARIANTES[dtype],
    embedExcedeBinding: maxStorageBufferBindingSize < TENSOR_MAS_GRANDE_DE_EMBED,
    tablaDeEmbed: TENSOR_MAS_GRANDE_DE_EMBED,
    maxStorageBufferBindingSize,
  };
}

/** Lo que baja la primera vez, según haya f16 o no: para el aviso, antes de cargar. */
export const bytesDelModelo = (f16: boolean) => VARIANTES[f16 ? "q4f16" : "q4"];

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export type APagina =
  /** Si hay adaptador WebGPU en el worker, y cuál. Sin WebGPU no hay plan B: por WASM no entra en memoria. */
  | ({ tipo: "check"; webgpu: true } & Gpu)
  | { tipo: "check"; webgpu: false; motivo: string }
  /** Al empezar `load`: qué variante baja y dónde corre. */
  | ({ tipo: "variante" } & Variante)
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
