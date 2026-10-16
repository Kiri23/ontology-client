// WebGPU en modo compatibilidad para Transformers.js y onnxruntime. Las dos piden el adaptador en modo core, y en el
// Pixel 10 Pro XL Chrome da null en core y un adaptador en compatibilidad (docs/webgpu-en-el-pixel-10.md). Ninguna de
// las dos deja pasar un adaptador o un device propio sin perder algo: con un device propio, onnxruntime no engancha su
// onuncapturederror (un buffer de más quedaría como aviso de consola y la AI diría "listo") y las session_options
// valen para todos los archivos (no se podría mandar un archivo a otro EP). Lo único que las dos comparten es
// navigator.gpu.requestAdapter: se reemplaza ahí, y cada una sigue creando su device como siempre.
import type { ModoWebGpu } from "./protocolo.ts";

/** Lo poco de WebGPU que se usa acá. TypeScript no trae sus tipos y @webgpu/types no está instalado. */
export interface AdaptadorWebGpu {
  features: ReadonlySet<string>;
  limits: { maxStorageBufferBindingSize: number };
}

/** Las opciones de requestAdapter. onnxruntime manda las suyas (powerPreference, featureLevel, …): se conservan. */
export type OpcionesDeAdaptador = { featureLevel?: string } & Record<string, unknown>;

export interface GpuDelNavegador {
  requestAdapter(opciones?: OpcionesDeAdaptador): Promise<AdaptadorWebGpu | null>;
}

/** Con las mismas opciones, primero como vienen (core, salvo que pidan otra cosa); si da null, en compatibilidad. */
export async function adaptadorWebGpu(
  gpu: GpuDelNavegador,
  opciones: OpcionesDeAdaptador = {},
): Promise<{ adapter: AdaptadorWebGpu; modo: ModoWebGpu } | null> {
  const pedido = await gpu.requestAdapter(opciones);
  if (pedido) return { adapter: pedido, modo: opciones.featureLevel === "compatibility" ? "compatibility" : "core" };
  if (opciones.featureLevel === "compatibility") return null;
  const compatible = await gpu.requestAdapter({ ...opciones, featureLevel: "compatibility" });
  return compatible ? { adapter: compatible, modo: "compatibility" } : null;
}

const instaladas = new WeakSet<GpuDelNavegador>();

/**
 * Desde acá, `gpu.requestAdapter` cae a compatibilidad cuando core da null. Es una propiedad propia del objeto (la del
 * prototipo queda intacta) y se instala una vez por objeto. Va antes del import() de Transformers.js: onnxruntime pide
 * el adaptador dos veces, al iniciar el backend (JS) y al crear su device (el glue de C++), y las dos leen
 * navigator.gpu.requestAdapter en el momento.
 */
export function instalarCompatibilidad(gpu: GpuDelNavegador): void {
  if (instaladas.has(gpu)) return;
  const original: GpuDelNavegador = { requestAdapter: gpu.requestAdapter.bind(gpu) };
  gpu.requestAdapter = async (opciones) => (await adaptadorWebGpu(original, opciones))?.adapter ?? null;
  instaladas.add(gpu);
}
