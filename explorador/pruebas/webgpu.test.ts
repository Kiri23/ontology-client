// WebGPU en modo compatibilidad (src/grafo/ai/webgpu.ts) y la elección de variante (opcionesDeCarga), con un
// navigator.gpu falso: el de verdad no existe en Node. Los números del Pixel son los medidos el 2026-10-16.
import { describe, expect, it } from "vitest";
import { opcionesDeCarga, TENSOR_MAS_GRANDE_DE_EMBED } from "../src/grafo/ai/protocolo.ts";
import {
  type AdaptadorWebGpu,
  adaptadorWebGpu,
  type GpuDelNavegador,
  instalarCompatibilidad,
  type OpcionesDeAdaptador,
} from "../src/grafo/ai/webgpu.ts";

const adaptador = (nombre: string): AdaptadorWebGpu & { nombre: string } => ({
  nombre,
  features: new Set(),
  limits: { maxStorageBufferBindingSize: 268_435_456 },
});

/** Un navigator.gpu que da `core` sin featureLevel (o con "core") y `compat` con "compatibility". Anota cada pedido. */
function gpuFalsa(core: AdaptadorWebGpu | null, compat: AdaptadorWebGpu | null) {
  const pedidos: OpcionesDeAdaptador[] = [];
  const gpu: GpuDelNavegador = {
    requestAdapter(opciones = {}) {
      pedidos.push(opciones);
      return Promise.resolve(opciones.featureLevel === "compatibility" ? compat : core);
    },
  };
  return { gpu, pedidos };
}

describe("adaptadorWebGpu", () => {
  it("con core, core: no pide compatibilidad", async () => {
    const { gpu, pedidos } = gpuFalsa(adaptador("core"), adaptador("compat"));
    expect(await adaptadorWebGpu(gpu)).toEqual({ adapter: adaptador("core"), modo: "core" });
    expect(pedidos).toHaveLength(1);
  });

  it("si core da null (el Pixel), compatibilidad, con las mismas opciones", async () => {
    const { gpu, pedidos } = gpuFalsa(null, adaptador("compat"));
    const dado = await adaptadorWebGpu(gpu, { powerPreference: "high-performance" });
    expect(dado).toEqual({ adapter: adaptador("compat"), modo: "compatibility" });
    expect(pedidos.at(-1)).toEqual({ powerPreference: "high-performance", featureLevel: "compatibility" });
  });

  it("sin adaptador en ningún modo, null", async () => {
    expect(await adaptadorWebGpu(gpuFalsa(null, null).gpu)).toBeNull();
  });
});

describe("instalarCompatibilidad", () => {
  it("lo que pide onnxruntime (powerPreference, featureLevel core) recibe el de compatibilidad y conserva sus opciones", async () => {
    const { gpu, pedidos } = gpuFalsa(null, adaptador("compat"));
    instalarCompatibilidad(gpu);
    expect(await gpu.requestAdapter({ powerPreference: "high-performance" })).toEqual(adaptador("compat"));
    expect(pedidos.at(-1)).toEqual({ powerPreference: "high-performance", featureLevel: "compatibility" });
    // El glue de C++ manda featureLevel "core" explícito.
    expect(await gpu.requestAdapter({ featureLevel: "core", forceFallbackAdapter: false })).toEqual(
      adaptador("compat"),
    );
  });

  it("con core no cambia nada, y una segunda instalación no apila otra vuelta", async () => {
    const { gpu, pedidos } = gpuFalsa(adaptador("core"), adaptador("compat"));
    instalarCompatibilidad(gpu);
    instalarCompatibilidad(gpu);
    expect(await gpu.requestAdapter()).toEqual(adaptador("core"));
    expect(pedidos).toEqual([{}]);
  });
});

describe("opcionesDeCarga", () => {
  it("el Pixel (sin f16, buffers de 256 MB): q4, 3,6 GB, embeddings en wasm y decoder en la GPU", () => {
    expect(opcionesDeCarga({ f16: false, maxStorageBufferBindingSize: 268_435_456 })).toEqual({
      dtype: "q4",
      bytes: 3_646_000_000,
      device: { embed_tokens: "wasm", decoder_model_merged: "webgpu" },
    });
  });

  it("escritorio (f16, buffers de 2 GB): q4f16, 3,1 GB, todo en la GPU", () => {
    expect(opcionesDeCarga({ f16: true, maxStorageBufferBindingSize: 2_147_483_648 })).toEqual({
      dtype: "q4f16",
      bytes: 3_130_000_000,
      device: "webgpu",
    });
  });

  it("el límite es el tensor más grande de embed_tokens (u8 [262144, 4480]), en los dos dtypes", () => {
    expect(TENSOR_MAS_GRANDE_DE_EMBED).toBe(1_174_405_120);
    const justo = { maxStorageBufferBindingSize: TENSOR_MAS_GRANDE_DE_EMBED };
    expect(opcionesDeCarga({ f16: true, ...justo }).device).toBe("webgpu");
    expect(opcionesDeCarga({ f16: true, maxStorageBufferBindingSize: TENSOR_MAS_GRANDE_DE_EMBED - 1 }).device)
      .toEqual({ embed_tokens: "wasm", decoder_model_merged: "webgpu" });
  });
});
