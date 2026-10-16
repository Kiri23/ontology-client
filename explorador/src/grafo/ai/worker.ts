// El worker de la AI: Gemma 3 270M por WebGPU con Transformers.js, fuera del hilo de la página. Es el modelo más chico
// de Gemma. Gemma 4 E2B (3,6 GB) no entra en el Pixel 10: la tabla de embeddings de E2B pesa 1 174 MB y la GPU del
// Pixel acepta buffers de 256 MB (docs/webgpu-en-el-pixel-10.md, docs/modelo-chico-para-el-pixel.md). Transformers.js va fijada en 4.3.1
// y empaquetada por Vite, el wasm de onnxruntime se sirve desde el propio origen, y WebGPU cae a modo compatibilidad
// cuando core no da adaptador (el Pixel 10 Pro XL; webgpu.ts).
//
// La librería entra con import() recién en `load`: abrir la consulta libre baja este archivo (unos KB) para el `check`,
// no los 581 kB de Transformers.js ni los 27 MB del wasm. Sin WebGPU no hay fallback a WASM (GatherBlockQuantized no
// tiene kernel de CPU).
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { OPCIONES_DE_PLANTILLA } from "./chat.ts";
import { type AlWorker, type APagina, type Mensaje, MODELO, type ModoWebGpu, opcionesDeCarga } from "./protocolo.ts";
import { type AdaptadorWebGpu, adaptadorWebGpu, type GpuDelNavegador, instalarCompatibilidad } from "./webgpu.ts";

const enviar = (m: APagina) => (self as unknown as { postMessage(m: APagina): void }).postMessage(m);

type Libreria = typeof import("@huggingface/transformers");
type Tokenizer = Awaited<ReturnType<Libreria["AutoTokenizer"]["from_pretrained"]>>;
type Modelo = Awaited<ReturnType<Libreria["Gemma3ForCausalLM"]["from_pretrained"]>>;

const mensajeDe = (e: unknown) => String((e as Error)?.message ?? e);
const gpu = (navigator as { gpu?: GpuDelNavegador }).gpu;

let cargado: Promise<{ lib: Libreria; tokenizer: Tokenizer; modelo: Modelo }> | undefined;
/** El adaptador del check: `load` lee de él el f16 y el límite de buffer. No pide device: eso lo hace onnxruntime. */
let adaptador: { adapter: AdaptadorWebGpu; modo: ModoWebGpu } | undefined;
/** Para los errores que no atrapa nadie: si llegan cargando o ya cargado. */
let etapa: "carga" | "generacion" = "carga";

/** El adaptador, core o compatibilidad. Sin WebGPU, o sin adaptador en ningún modo, tira con el motivo. */
async function pedirAdaptador(): Promise<{ adapter: AdaptadorWebGpu; modo: ModoWebGpu }> {
  if (!gpu) throw new Error("El navegador no tiene WebGPU.");
  // "high-performance" es lo que Transformers.js le pide a onnxruntime: el mismo adaptador que va a usar la carga.
  const dado = await adaptadorWebGpu(gpu, { powerPreference: "high-performance" });
  if (!dado) throw new Error("El navegador tiene WebGPU, pero no dio un adaptador ni en modo compatibilidad.");
  return dado;
}

async function check(): Promise<void> {
  try {
    adaptador ??= await pedirAdaptador();
    const { adapter, modo } = adaptador;
    enviar({
      tipo: "check",
      webgpu: true,
      modo,
      f16: adapter.features.has("shader-f16"),
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    });
  } catch (e) {
    enviar({ tipo: "check", webgpu: false, motivo: mensajeDe(e) });
  }
}

/** input_ids y attention_mask del prompt, en una llamada (chat.ts dice por qué no hay un `<bos>` de más). */
const entradas = (tokenizer: Tokenizer, mensajes: Mensaje[]) =>
  tokenizer.apply_chat_template(mensajes, OPCIONES_DE_PLANTILLA);

async function cargar() {
  // Un worker nuevo después de un fallo de carga no recibe check: el adaptador se pide acá.
  const { adapter } = adaptador ??= await pedirAdaptador();
  const variante = opcionesDeCarga({
    f16: adapter.features.has("shader-f16"),
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
  });
  enviar({ tipo: "variante", ...variante });
  const { dtype } = variante;
  // Antes del import(): onnxruntime lee navigator.gpu.requestAdapter cuando pide su adaptador.
  instalarCompatibilidad(gpu!);
  const lib = await import("@huggingface/transformers");
  // Sin esto onnxruntime baja su wasm de cdn.jsdelivr.net, que la CSP no deja.
  lib.env.backends.onnx.wasm!.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
  // La suma la hace acá, con los "progress" de cada archivo: el "progress_total" de Transformers.js sale antes que el
  // "progress" del mismo pedazo (el archivo iría un evento atrasado) y es uno por from_pretrained (el del tokenizer y
  // el del modelo se pisarían).
  let ultimo = 0;
  const archivos = new Map<string, { cargado: number; total: number }>();
  const progreso = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress" || !info.file) return;
    archivos.set(info.file, { cargado: info.loaded ?? 0, total: info.total ?? 0 });
    const ahora = performance.now();
    if (ahora - ultimo < 250 && info.loaded !== info.total) return;
    ultimo = ahora;
    let [cargado, total] = [0, 0];
    for (const a of archivos.values()) [cargado, total] = [cargado + a.cargado, total + a.total];
    enviar({ tipo: "progreso", archivo: info.file, cargado, total });
  };
  const opciones = { progress_callback: progreso as never };
  const [tokenizer, modelo] = await Promise.all([
    lib.AutoTokenizer.from_pretrained(MODELO, opciones),
    // Una sola sesión, `model`: onnx/model_<dtype>.onnx y sus pesos en model_<dtype>.onnx_data. El config.json del repo
    // ya pide external data; va explícito para no depender de él.
    lib.Gemma3ForCausalLM.from_pretrained(MODELO, {
      ...opciones,
      dtype,
      device: "webgpu",
      use_external_data_format: true,
    }),
  ]);
  // Un token de prueba compila los shaders; si no, la primera pregunta tarda eso de más. Sin muestreo, como al generar.
  enviar({ tipo: "preparando" });
  await modelo.generate({
    ...entradas(tokenizer, [{ role: "user", content: "hola" }]),
    do_sample: false,
    max_new_tokens: 1,
  });
  etapa = "generacion";
  return { lib, tokenizer, modelo };
}

async function load(): Promise<void> {
  cargado ??= cargar();
  try {
    await cargado;
    enviar({ tipo: "listo" });
  } catch (e) {
    cargado = undefined;
    enviar({ tipo: "error", cuando: "carga", mensaje: mensajeDe(e), nombre: (e as Error)?.name });
  }
}

async function generate(mensajes: Mensaje[]): Promise<void> {
  try {
    if (!cargado) throw new Error("El modelo no está cargado.");
    const { lib, tokenizer, modelo } = await cargado;
    let texto = "";
    const streamer = new lib.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (pedazo: string) => {
        texto += pedazo;
        enviar({ tipo: "token", texto: pedazo });
      },
    });
    // Sin muestreo: la misma pregunta da la misma consulta. 320 tokens alcanzan para una consulta sin PREFIX.
    await modelo.generate({
      ...entradas(tokenizer, mensajes),
      do_sample: false,
      max_new_tokens: 320,
      streamer,
    });
    enviar({ tipo: "generado", texto });
  } catch (e) {
    enviar({ tipo: "error", cuando: "generacion", mensaje: mensajeDe(e) });
  }
}

// Lo que nadie atrapa (una promesa de onnxruntime, un error de WebGPU que se cuela) no queda solo en la consola: va a
// la página como error. preventDefault: que no llegue además como "error" del Worker, que la página lee como un worker
// que no arrancó.
self.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  e.preventDefault();
  enviar({ tipo: "error", cuando: etapa, mensaje: mensajeDe(e.reason) });
});
self.addEventListener("error", (e: ErrorEvent) => {
  e.preventDefault();
  enviar({ tipo: "error", cuando: etapa, mensaje: e.message || "Error en el worker de la AI." });
});

self.addEventListener("message", (e: MessageEvent<AlWorker>) => {
  const m = e.data;
  if (m.tipo === "check") void check();
  else if (m.tipo === "load") void load();
  else if (m.tipo === "generate") void generate(m.mensajes);
});
