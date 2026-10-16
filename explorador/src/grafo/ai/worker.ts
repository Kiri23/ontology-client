// El worker de la AI: Gemma 4 E2B por WebGPU con Transformers.js, fuera del hilo de la página. Es la receta de
// DocsifyTemplate (packages/chat/core/worker.js) con tres cambios: Transformers.js fijada en 4.3.1 y empaquetada por
// Vite, Gemma4ForCausalLM (texto solo: 3,1 GB en vez de 3,4) y el wasm de onnxruntime servido desde el propio origen.
//
// La librería entra con import() recién en `load`: abrir la consulta libre baja este archivo (unos KB) para el `check`,
// no los 581 kB de Transformers.js ni los 27 MB del wasm. Sin WebGPU no hay fallback a WASM (no entra en memoria).
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { chatDeGemma, OPCIONES_DE_PLANTILLA } from "./chat.ts";
import { type AlWorker, type APagina, type Mensaje, MODELO } from "./protocolo.ts";

const enviar = (m: APagina) => (self as unknown as { postMessage(m: APagina): void }).postMessage(m);

type Libreria = typeof import("@huggingface/transformers");
type Procesador = Awaited<ReturnType<Libreria["AutoProcessor"]["from_pretrained"]>>;
type Modelo = Awaited<ReturnType<Libreria["Gemma4ForCausalLM"]["from_pretrained"]>>;

let cargado: Promise<{ lib: Libreria; procesador: Procesador; modelo: Modelo }> | undefined;

async function check(): Promise<void> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    const adaptador = await gpu?.requestAdapter();
    enviar(
      adaptador ? { tipo: "check", webgpu: true } : {
        tipo: "check",
        webgpu: false,
        motivo: gpu ? "El navegador tiene WebGPU, pero no dio un adaptador." : "El navegador no tiene WebGPU.",
      },
    );
  } catch (e) {
    enviar({ tipo: "check", webgpu: false, motivo: String(e) });
  }
}

async function entradas(procesador: Procesador, mensajes: Mensaje[]) {
  // enable_thinking no está en los tipos: Transformers.js le pasa al template de Jinja las opciones que no conoce.
  const opciones = OPCIONES_DE_PLANTILLA as unknown as { add_generation_prompt: boolean };
  const texto = procesador.apply_chat_template(chatDeGemma(mensajes) as never, opciones);
  return await (procesador as unknown as (t: unknown, ...r: unknown[]) => Promise<Record<string, unknown>>)(
    texto,
    null,
    null,
    { add_special_tokens: false },
  );
}

async function cargar() {
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
  const [procesador, modelo] = await Promise.all([
    lib.AutoProcessor.from_pretrained(MODELO, opciones),
    lib.Gemma4ForCausalLM.from_pretrained(MODELO, {
      ...opciones,
      dtype: "q4f16",
      device: "webgpu",
      use_external_data_format: true,
    }),
  ]);
  // Un token de prueba compila los shaders; si no, la primera pregunta tarda eso de más.
  enviar({ tipo: "preparando" });
  await modelo.generate({ ...(await entradas(procesador, [{ role: "user", content: "hola" }])), max_new_tokens: 1 });
  return { lib, procesador, modelo };
}

async function load(): Promise<void> {
  cargado ??= cargar();
  try {
    await cargado;
    enviar({ tipo: "listo" });
  } catch (e) {
    cargado = undefined;
    enviar({ tipo: "error", cuando: "carga", mensaje: String((e as Error)?.message ?? e), nombre: (e as Error)?.name });
  }
}

async function generate(mensajes: Mensaje[]): Promise<void> {
  try {
    if (!cargado) throw new Error("El modelo no está cargado.");
    const { lib, procesador, modelo } = await cargado;
    let texto = "";
    const streamer = new lib.TextStreamer(procesador.tokenizer!, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (pedazo: string) => {
        texto += pedazo;
        enviar({ tipo: "token", texto: pedazo });
      },
    });
    // Sin muestreo: la misma pregunta da la misma consulta. 320 tokens alcanzan para una consulta sin PREFIX.
    await modelo.generate({
      ...(await entradas(procesador, mensajes)),
      do_sample: false,
      max_new_tokens: 320,
      streamer,
    });
    enviar({ tipo: "generado", texto });
  } catch (e) {
    enviar({ tipo: "error", cuando: "generacion", mensaje: String((e as Error)?.message ?? e) });
  }
}

self.addEventListener("message", (e: MessageEvent<AlWorker>) => {
  const m = e.data;
  if (m.tipo === "check") void check();
  else if (m.tipo === "load") void load();
  else if (m.tipo === "generate") void generate(m.mensajes);
});
