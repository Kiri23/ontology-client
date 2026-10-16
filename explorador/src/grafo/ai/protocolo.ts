// Lo que se dicen la página y el worker de la AI (worker.ts). Un solo archivo para los dos lados: si un mensaje cambia,
// tsc lo marca en ambos.

/**
 * El modelo: Gemma 3 270M en ONNX, texto solo, el más chico de Gemma. Gemma 4 E2B no entra en el Pixel 10
 * (docs/modelo-chico-para-el-pixel.md).
 */
export const MODELO = "onnx-community/gemma-3-270m-it-ONNX";

/**
 * Cómo se pide el adaptador WebGPU. "compatibility" es WebGPU recortado (el de OpenGL ES): es lo único que Chrome da en
 * el Pixel 10 Pro XL, cuya GPU no pasa como core (docs/webgpu-en-el-pixel-10.md).
 */
export type ModoWebGpu = "core" | "compatibility";

/**
 * Lo que el worker sabe de la GPU después del `check`: con qué modo dio adaptador, si los shaders tienen f16 y el
 * buffer más grande que acepta un shader (si no entra la tabla de embeddings, se avisa).
 */
export interface Gpu {
  modo: ModoWebGpu;
  f16: boolean;
  maxStorageBufferBindingSize: number;
}

/**
 * Qué variante del modelo baja y cuánto pesa la primera vez: `model_<dtype>.onnx` + `.onnx_data` + `tokenizer.json`
 * (20 323 013 B), de la API de Hugging Face (`/api/models/onnx-community/gemma-3-270m-it-ONNX/tree/main/onnx`,
 * 2026-10-16). Los .json chicos (config, tokenizer_config) no suman ni 5 kB.
 * - `q4f16` (pesos de 4 bits, cuentas en f16): 330 717 + 272 626 176 + tokenizer = 293 MB.
 * - `q4` (pesos de 4 bits, cuentas en f32): 242 522 + 322 933 248 + tokenizer = 343 MB. Es la que queda sin
 *   `shader-f16`: un shader de f16 en una GPU sin f16 no compila.
 */
const VARIANTES = {
  q4f16: 330_717 + 272_626_176 + 20_323_013,
  q4: 242_522 + 322_933_248 + 20_323_013,
} as const;

/**
 * La tabla de embeddings: `model_embed_tokens_weight_quant`, u8 [262144, 320] = 84 MB (80 MiB), igual en `q4` y en
 * `q4f16`. Es uno de los dos tensores más grandes del modelo; el otro, `…_weight_quant_matmul` (u8 [262144, 20, 16]),
 * es la misma tabla para el lm_head y pesa lo mismo. La tabla la usa `GatherBlockQuantized`, que en WebGPU la ata
 * entera a un binding; si la GPU no acepta un buffer así, la sesión no se crea ("exceeding maxStorageBufferBindingSize
 * of"). Entra en los dos límites medidos en el Pixel 10: 256 MiB en modo compatibilidad y 128 MiB en core (con la
 * blocklist desactivada por flag).
 *
 * Con este modelo `embedExcedeBinding` no salta en ninguna GPU estándar: WebGPU garantiza al menos 128 MiB por binding.
 * Queda porque con `gemma-3-1b` (tabla de 151 MB, más que 128 MiB) volvería a hacer falta en core. Con Gemma 4 E2B la
 * tabla per-layer pesaba 1 174 MB y no entraba en ninguno de los dos; tampoco podía ir a wasm, porque este
 * onnxruntime-web solo trae `GatherBlockQuantized` para WebGPU (docs/webgpu-en-el-pixel-10.md).
 */
export const TENSOR_MAS_GRANDE_DE_EMBED = 262_144 * 320;

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
  /**
   * Si hay adaptador WebGPU en el worker, y cuál. Sin WebGPU no hay plan B: `GatherBlockQuantized` no tiene kernel de
   * CPU en este onnxruntime-web.
   */
  | ({ tipo: "check"; webgpu: true } & Gpu)
  | { tipo: "check"; webgpu: false; motivo: string }
  /** Al empezar `load`: qué variante baja y si su tabla de embeddings entra en un buffer. */
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
