// El worker de la AI: Gemma 4 E2B por WebGPU con Transformers.js, fuera del hilo de la página. Es la receta de
// DocsifyTemplate (packages/chat/core/worker.js) con cuatro cambios: Transformers.js fijada en 4.3.1 y empaquetada por
// Vite, Gemma4ForCausalLM (texto solo: 3,1 GB en vez de 3,4), el wasm de onnxruntime servido desde el propio origen, y
// el adaptador y el device de WebGPU los pide el worker, no onnxruntime: así entra la GPU que solo da modo
// compatibilidad (la del Pixel 10 Pro XL; docs/webgpu-en-el-pixel-10.md).
//
// La librería entra con import() recién en `load`: abrir la consulta libre baja este archivo (unos KB) para el `check`,
// no los 581 kB de Transformers.js ni los 27 MB del wasm. Sin WebGPU no hay fallback a WASM (no entra en memoria).
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { chatDeGemma, OPCIONES_DE_PLANTILLA } from "./chat.ts";
import { type AlWorker, type APagina, eleccionDeCarga, type Mensaje, MODELO, type ModoWebGpu } from "./protocolo.ts";

const enviar = (m: APagina) => (self as unknown as { postMessage(m: APagina): void }).postMessage(m);

type Libreria = typeof import("@huggingface/transformers");
type Procesador = Awaited<ReturnType<Libreria["AutoProcessor"]["from_pretrained"]>>;
type Modelo = Awaited<ReturnType<Libreria["Gemma4ForCausalLM"]["from_pretrained"]>>;

/** Lo poco de WebGPU que usa el worker. TypeScript no trae sus tipos y @webgpu/types no está instalado. */
interface Adaptador {
  features: ReadonlySet<string>;
  /** GPUSupportedLimits: los límites son atributos de su prototipo. */
  limits: object;
  requestDevice(d: { requiredFeatures: string[]; requiredLimits: Record<string, number> }): Promise<Dispositivo>;
}
interface Dispositivo {
  lost: Promise<{ reason?: string; message: string }>;
  destroy(): void;
}
interface ConGpu {
  gpu?: {
    requestAdapter(o: { powerPreference: "high-performance"; featureLevel?: ModoWebGpu }): Promise<Adaptador | null>;
  };
}

const mensajeDe = (e: unknown) => String((e as Error)?.message ?? e);

let cargado: Promise<{ lib: Libreria; procesador: Procesador; modelo: Modelo }> | undefined;
/** El adaptador que pidió el check, para `load`. Un adaptador da un solo device: la carga lo consume. */
let adaptador: { adapter: Adaptador; modo: ModoWebGpu } | undefined;
/** Para el aviso de "device lost": la GPU se puede perder bajando el modelo o ya cargado. */
let etapa: "carga" | "generacion" = "carga";

/**
 * Primero core; si no da, compatibilidad. Chrome en el Pixel 10 Pro XL da null en core y un adaptador en
 * compatibilidad. "high-performance" es lo que Transformers.js le pide a onnxruntime cuando el adaptador lo busca él.
 */
async function adaptadorWebGpu(): Promise<{ adapter: Adaptador; modo: ModoWebGpu }> {
  const gpu = (navigator as ConGpu).gpu;
  if (!gpu) throw new Error("El navegador no tiene WebGPU.");
  const core = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (core) return { adapter: core, modo: "core" };
  const compatible = await gpu.requestAdapter({ powerPreference: "high-performance", featureLevel: "compatibility" });
  if (compatible) return { adapter: compatible, modo: "compatibility" };
  throw new Error("El navegador tiene WebGPU, pero no dio un adaptador ni en modo compatibilidad.");
}

async function check(): Promise<void> {
  try {
    adaptador = await adaptadorWebGpu();
    const { adapter, modo } = adaptador;
    enviar({ tipo: "check", webgpu: true, modo, f16: adapter.features.has("shader-f16") });
  } catch (e) {
    enviar({ tipo: "check", webgpu: false, motivo: mensajeDe(e) });
  }
}

/** Un device con todo lo que da el adaptador: lo mismo que pide onnxruntime cuando lo arma él. */
async function dispositivo(adapter: Adaptador): Promise<Dispositivo> {
  const requiredLimits: Record<string, number> = {};
  // Object.keys no ve los atributos del prototipo; for…in sí.
  for (const nombre in adapter.limits) {
    const valor = (adapter.limits as Record<string, unknown>)[nombre];
    if (typeof valor === "number") requiredLimits[nombre] = valor;
  }
  const device = await adapter.requestDevice({ requiredFeatures: [...adapter.features], requiredLimits });
  // "device lost" es la frase que el cliente reconoce (GPU_PERDIDA): termina este worker y abre otro al cargar.
  void device.lost.then(({ reason, message }) => {
    if (reason === "destroyed") return;
    cargado = undefined;
    enviar({ tipo: "error", cuando: etapa, mensaje: `GPU device lost (${reason ?? "unknown"}): ${message}` });
  });
  return device;
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
  const { adapter } = adaptador ?? (await adaptadorWebGpu());
  adaptador = undefined;
  // onnxruntime, al iniciar su backend de WebGPU, pide su propio adaptador en modo core (null en el Pixel) si no
  // encuentra uno acá. El device va en la sesión: env.webgpu.device no lo respeta este build (microsoft/onnxruntime#26107).
  lib.env.backends.onnx.webgpu!.adapter = adapter;
  const device = await dispositivo(adapter);
  // Sin shader-f16, q4f16 no compila: baja q4, que pesa medio GB más.
  const { dtype } = eleccionDeCarga({ f16: adapter.features.has("shader-f16") });
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
  try {
    const [procesador, modelo] = await Promise.all([
      lib.AutoProcessor.from_pretrained(MODELO, opciones),
      lib.Gemma4ForCausalLM.from_pretrained(MODELO, {
        ...opciones,
        dtype,
        device: "webgpu",
        use_external_data_format: true,
        // Transformers.js usa estos si vienen (getSession: `session_options.executionProviders ??= ...`).
        session_options: { executionProviders: [{ name: "webgpu", device }] },
      }),
    ]);
    // Un token de prueba compila los shaders; si no, la primera pregunta tarda eso de más.
    enviar({ tipo: "preparando" });
    await modelo.generate({ ...(await entradas(procesador, [{ role: "user", content: "hola" }])), max_new_tokens: 1 });
    etapa = "generacion";
    return { lib, procesador, modelo };
  } catch (e) {
    // Lo que alcanzó a subir a la GPU no queda tomado: Probar de nuevo pide otro adaptador y otro device.
    device.destroy();
    throw e;
  }
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
    enviar({ tipo: "error", cuando: "generacion", mensaje: mensajeDe(e) });
  }
}

self.addEventListener("message", (e: MessageEvent<AlWorker>) => {
  const m = e.data;
  if (m.tipo === "check") void check();
  else if (m.tipo === "load") void load();
  else if (m.tipo === "generate") void generate(m.mensajes);
});
