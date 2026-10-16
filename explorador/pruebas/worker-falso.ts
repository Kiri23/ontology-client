// El worker de la AI, falso: anota lo que le manda la página y contesta lo que la prueba le hace emitir.
import type { WorkerAi } from "../src/grafo/ai/cliente.ts";
import type { AlWorker, APagina } from "../src/grafo/ai/protocolo.ts";

/** Un worker que anota lo que recibe y contesta lo que la prueba le hace emitir. */
export function workerFalso() {
  const oyentes: ((e: MessageEvent<APagina>) => void)[] = [];
  const recibidos: AlWorker[] = [];
  const worker: WorkerAi = {
    postMessage: (m) => void recibidos.push(m),
    addEventListener: (tipo: string, oyente: unknown) =>
      void (tipo === "message" && oyentes.push(oyente as (e: MessageEvent<APagina>) => void)),
  };
  const emitir = (m: APagina) => oyentes.forEach((o) => o({ data: m } as MessageEvent<APagina>));
  return { worker, recibidos, emitir };
}
