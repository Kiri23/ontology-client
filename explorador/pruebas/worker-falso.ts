// El worker de la AI, falso: anota lo que le manda la página y contesta lo que la prueba le hace emitir. Un `generate`
// pasa por la plantilla de chat real de Gemma 4, como en el worker de verdad: si la conversación no se puede
// renderizar, contesta el mismo error que daría Transformers.js.
import type { WorkerAi } from "../src/grafo/ai/cliente.ts";
import type { AlWorker, APagina, Gpu } from "../src/grafo/ai/protocolo.ts";
import { renderizarParaGemma } from "./plantilla-gemma.ts";

/** La GPU de escritorio: modo core, shader-f16 y buffers de 2 GB (baja q4f16, 3,1 GB, todo en la GPU). */
export const GPU_DE_ESCRITORIO: Gpu = { modo: "core", f16: true, maxStorageBufferBindingSize: 2_147_483_648 };
/**
 * La del Pixel 10 Pro XL medida el 2026-10-16: solo modo compatibilidad, sin shader-f16 y buffers de 256 MB (baja q4,
 * 3,6 GB; la tabla de embeddings no entra en un buffer).
 */
export const GPU_DEL_PIXEL: Gpu = { modo: "compatibility", f16: false, maxStorageBufferBindingSize: 268_435_456 };

export function workerFalso() {
  const oyentes: ((e: MessageEvent<APagina>) => void)[] = [];
  const oyentesDeError: ((e: ErrorEvent) => void)[] = [];
  const recibidos: AlWorker[] = [];
  /** Los prompts que vio la plantilla, uno por `generate`. */
  const prompts: string[] = [];
  const estado = { terminado: false };
  const emitir = (m: APagina) => oyentes.forEach((o) => o({ data: m } as MessageEvent<APagina>));
  const worker: WorkerAi = {
    postMessage: (m) => {
      recibidos.push(m);
      if (m.tipo !== "generate") return;
      try {
        prompts.push(renderizarParaGemma(m.mensajes));
      } catch (e) {
        emitir({ tipo: "error", cuando: "generacion", mensaje: String((e as Error).message) });
      }
    },
    addEventListener: (tipo: string, oyente: unknown) => {
      if (tipo === "message") oyentes.push(oyente as (e: MessageEvent<APagina>) => void);
      if (tipo === "error") oyentesDeError.push(oyente as (e: ErrorEvent) => void);
    },
    terminate: () => void (estado.terminado = true),
  };
  /** El `check` con adaptador. Por defecto, una GPU de escritorio: modo core y con f16. */
  const conWebGpu = (gpu: Gpu = GPU_DE_ESCRITORIO) => emitir({ tipo: "check", webgpu: true, ...gpu });
  /** El worker no arrancó: lo que hace el navegador si la CSP o la red bloquean su script. */
  const fallar = (mensaje: string) => oyentesDeError.forEach((o) => o({ message: mensaje } as ErrorEvent));
  return { worker, recibidos, prompts, emitir, conWebGpu, fallar, estado };
}
