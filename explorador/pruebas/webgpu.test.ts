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
  it("el Pixel en compatibilidad (sin f16, buffers de 256 MB): q4, 343 MB, y la tabla de embeddings entra", () => {
    expect(opcionesDeCarga({ f16: false, maxStorageBufferBindingSize: 268_435_456 })).toEqual({
      dtype: "q4",
      bytes: 343_498_783,
      embedExcedeBinding: false,
      tablaDeEmbed: 83_886_080,
      maxStorageBufferBindingSize: 268_435_456,
    });
  });

  it("el Pixel en core con la flag (buffers de 128 MB) también entra", () => {
    expect(opcionesDeCarga({ f16: true, maxStorageBufferBindingSize: 134_217_728 }).embedExcedeBinding).toBe(false);
  });

  it("escritorio (f16, buffers de 2 GB): q4f16, 293 MB, sin aviso", () => {
    expect(opcionesDeCarga({ f16: true, maxStorageBufferBindingSize: 2_147_483_648 })).toMatchObject({
      dtype: "q4f16",
      bytes: 293_279_906,
      embedExcedeBinding: false,
    });
  });

  it("el límite es el tensor más grande del modelo (embed_tokens, u8 [262144, 320]), en los dos dtypes", () => {
    expect(TENSOR_MAS_GRANDE_DE_EMBED).toBe(83_886_080);
    const justo = { maxStorageBufferBindingSize: TENSOR_MAS_GRANDE_DE_EMBED };
    expect(opcionesDeCarga({ f16: true, ...justo }).embedExcedeBinding).toBe(false);
    expect(opcionesDeCarga({ f16: false, ...justo }).embedExcedeBinding).toBe(false);
    const menos = { maxStorageBufferBindingSize: TENSOR_MAS_GRANDE_DE_EMBED - 1 };
    expect(opcionesDeCarga({ f16: true, ...menos }).embedExcedeBinding).toBe(true);
  });
});
