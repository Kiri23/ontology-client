// El worker de la AI: Gemma 4 E2B por WebGPU con Transformers.js, fuera del hilo de la página. Es la receta de
// DocsifyTemplate (packages/chat/core/worker.js) con tres cambios: Transformers.js fijada en 4.3.1 y empaquetada por
// Vite, Gemma4ForCausalLM (texto solo: 3,1 GB en vez de 3,4) y el wasm de onnxruntime servido desde el propio origen.
//
// La librería entra con import() recién en `load`: abrir la consulta libre baja este archivo (unos KB) para el `check`,
// no los 1,2 MB de Transformers.js ni los 27 MB del wasm. Sin WebGPU no hay fallback a WASM (no entra en memoria).
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
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

/** Gemma 4 quiere el contenido como partes ({type: "text"}), como en DocsifyTemplate. */
async function entradas(procesador: Procesador, mensajes: Mensaje[]) {
  const chat = mensajes.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] }));
  // enable_thinking no está en los tipos: Transformers.js le pasa al template de Jinja las opciones que no conoce.
  const opciones = { add_generation_prompt: true, enable_thinking: false };
  const texto = procesador.apply_chat_template(chat as never, opciones as { add_generation_prompt: boolean });
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
  let ultimo = 0;
  let archivo = "";
  const progreso = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === "progress" && info.file) archivo = info.file;
    if (info.status !== "progress_total") return;
    const ahora = performance.now();
    if (ahora - ultimo < 250 && info.loaded !== info.total) return;
    ultimo = ahora;
    enviar({ tipo: "progreso", archivo, cargado: info.loaded ?? 0, total: info.total ?? 0 });
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
