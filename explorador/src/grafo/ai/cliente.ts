// La AI vista desde la página: el worker y un estado que React lee con useSyncExternalStore. Uno solo por pestaña
// (clienteCompartido). Al salir de la consulta libre, cerrar() termina el worker: los ~300 MB del modelo no quedan
// tomados en la GPU mientras se leen otras historias. Volver lo carga de nuevo desde la Cache API, sin bajarlo.
import type { AlWorker, APagina, Gpu, Mensaje, Variante } from "./protocolo.ts";

export interface Progreso {
  archivo: string;
  cargado: number;
  total: number;
}

export type EstadoAi =
  | { fase: "revisando" }
  | { fase: "sin-webgpu"; motivo: string }
  /** El worker no arrancó (la CSP o la red bloquearon su script): no es que falte WebGPU. */
  | { fase: "sin-worker"; motivo: string }
  /**
   * De acá en adelante, `gpu` es lo que dijo el check: con qué modo dio adaptador, si hay f16 (de eso sale cuánto
   * baja) y el buffer más grande que acepta.
   * `error`: se perdió la GPU y el modelo se descargó de la memoria; hay que cargarlo de nuevo.
   */
  | { fase: "disponible"; gpu: Gpu; error?: string }
  /** `variante`: la que eligió el worker al empezar (tamaño real y si la tabla de embeddings entra en un buffer). */
  | { fase: "bajando"; gpu: Gpu; variante?: Variante; progreso?: Progreso }
  | { fase: "preparando"; gpu: Gpu }
  /** `error`: la última generación falló; el modelo sigue cargado. */
  | { fase: "listo"; gpu: Gpu; error?: string }
  | { fase: "generando"; gpu: Gpu; parcial: string }
  | { fase: "fallo-carga"; gpu: Gpu; mensaje: string; pista: string };

/** Lo que el cliente usa de un Worker: así las pruebas le pasan uno falso. */
export interface WorkerAi {
  postMessage(m: AlWorker): void;
  addEventListener(tipo: "message", oyente: (e: MessageEvent<APagina>) => void): void;
  addEventListener(tipo: "error", oyente: (e: ErrorEvent) => void): void;
  terminate(): void;
}

/**
 * El porcentaje de la descarga. El total crece a medida que empieza cada archivo: se mide contra `esperado`, lo que pesa
 * la variante que baja (bytesDelModelo).
 */
export const porcentaje = ({ cargado, total }: Progreso, esperado: number) =>
  Math.min(100, Math.floor((cargado / Math.max(total, esperado)) * 100));

/**
 * Qué hacer después de un error de carga, en una frase. Probar de nuevo abre un worker nuevo: lo que ya bajó queda en
 * la Cache API, pero un error de la GPU (un buffer que no acepta, un kernel que no compila) se repite igual.
 */
export function pistaDeCarga(mensaje: string, nombre = ""): string {
  if (/quota/i.test(nombre + mensaje)) {
    return "No queda lugar en el navegador para el modelo: liberá espacio en el teléfono y probá de nuevo.";
  }
  if (/fetch|network|load failed/i.test(mensaje)) {
    return "Se cortó la descarga. Con conexión, Probar de nuevo retoma: los archivos que ya bajaron quedan guardados.";
  }
  if (/gpu|device|adapter|webgpu|buffer|shader/i.test(mensaje)) {
    return "La GPU no pudo con el modelo. Probar de nuevo no vuelve a bajar nada, pero un error de la GPU suele " +
      "repetirse: si pasa otra vez, este dispositivo no alcanza.";
  }
  return "Probá de nuevo; si sigue, recargá la página.";
}

/**
 * La GPU se perdió (driver reiniciado, memoria): las sesiones de WebGPU quedan muertas y reintentar no sirve.
 * "external Instance reference no longer exists" es el texto de Dawn con el device perdido (Pixel 10, 2026-10-16,
 * Gemma 3 270M).
 */
export const GPU_PERDIDA =
  /device (was )?lost|GPUDevice|DeviceLost|external Instance reference|Instance reference no longer exists/i;

export class ClienteAi {
  #estado: EstadoAi;
  #oyentes = new Set<() => void>();
  #worker?: WorkerAi;
  #pedido?: { resolver(texto: string): void; rechazar(e: Error): void; parcial: string };

  /** `hayGpu` se fija en el hilo de la página antes de abrir el worker: sin `navigator.gpu` no se baja ni el worker. */
  constructor(private crear: () => WorkerAi, hayGpu: () => boolean) {
    this.#estado = hayGpu() ? { fase: "revisando" } : { fase: "sin-webgpu", motivo: "El navegador no tiene WebGPU." };
  }

  estado = () => this.#estado;

  suscribir = (oyente: () => void) => {
    this.#oyentes.add(oyente);
    return () => void this.#oyentes.delete(oyente);
  };

  #poner(estado: EstadoAi) {
    this.#estado = estado;
    for (const o of this.#oyentes) o();
  }

  #abrir(): WorkerAi {
    if (this.#worker) return this.#worker;
    const w = this.crear();
    // Lo que diga un worker ya cerrado no cambia nada: cerrar() lo reemplaza.
    const vigente = () => w === this.#worker;
    w.addEventListener("message", (e) => vigente() && this.#recibir(e.data));
    // El worker no arrancó (la CSP, un chunk que no llegó): en la revisión es "sin worker", después un fallo de carga.
    w.addEventListener("error", (e) => {
      if (!vigente()) return;
      const mensaje = e.message || "El worker de la AI no arrancó.";
      if (this.#estado.fase === "revisando") this.#poner({ fase: "sin-worker", motivo: mensaje });
      else this.#recibir({ tipo: "error", cuando: "carga", mensaje });
    });
    return (this.#worker = w);
  }

  #recibir(m: APagina) {
    const e = this.#estado;
    if (m.tipo === "check") {
      if (e.fase === "revisando") {
        this.#poner(
          m.webgpu
            ? {
              fase: "disponible",
              gpu: { modo: m.modo, f16: m.f16, maxStorageBufferBindingSize: m.maxStorageBufferBindingSize },
            }
            : { fase: "sin-webgpu", motivo: m.motivo },
        );
      }
      return;
    }
    // Lo demás llega después de un check con WebGPU: el estado ya trae la GPU.
    if (!("gpu" in e)) return;
    const { gpu } = e;
    if (m.tipo === "variante") {
      const { tipo: _, ...variante } = m;
      if (e.fase === "bajando") this.#poner({ ...e, variante });
    } else if (m.tipo === "progreso") {
      if (e.fase === "bajando") this.#poner({ ...e, progreso: m });
    } else if (m.tipo === "preparando") this.#poner({ fase: "preparando", gpu });
    else if (m.tipo === "listo") this.#poner({ fase: "listo", gpu });
    else if (m.tipo === "token" && this.#pedido) {
      this.#pedido.parcial += m.texto;
      this.#poner({ fase: "generando", gpu, parcial: this.#pedido.parcial });
    } else if (m.tipo === "generado" && this.#pedido) {
      const pedido = this.#pedido;
      this.#pedido = undefined;
      this.#poner({ fase: "listo", gpu });
      pedido.resolver(m.texto);
    } else if (m.tipo === "error") {
      if (GPU_PERDIDA.test(m.mensaje)) this.#soltar(m.mensaje);
      else if (m.cuando === "generacion" || this.#pedido) {
        const pedido = this.#pedido;
        this.#pedido = undefined;
        this.#poner({ fase: "listo", gpu, error: m.mensaje });
        pedido?.rechazar(new Error(m.mensaje));
      } else if (e.fase === "bajando" || e.fase === "preparando") {
        // onnxruntime queda abortado en ese worker: Probar de nuevo abre uno limpio.
        this.#terminar();
        this.#poner({ fase: "fallo-carga", gpu, mensaje: m.mensaje, pista: pistaDeCarga(m.mensaje, m.nombre) });
      } else {
        // Un error sin atrapar con el worker ocioso (nadie tocó Continuar): no es un fallo de carga.
        console.warn("La AI avisó un error sin estar cargando:", m.mensaje);
      }
    }
  }

  /** Pregunta al worker si hay adaptador WebGPU. Una vez: después no hace nada. */
  revisar() {
    if (this.#estado.fase === "revisando" && !this.#worker) this.#abrir().postMessage({ tipo: "check" });
  }

  /** Baja (o lee del disco) el modelo. Solo después del aviso de tamaño: la UI lo llama desde Continuar. */
  cargar() {
    const e = this.#estado;
    if (e.fase !== "disponible" && e.fase !== "fallo-carga") return;
    this.#poner({ fase: "bajando", gpu: e.gpu });
    // Que el navegador no desaloje el modelo cuando le falte lugar. Chrome lo concede sin preguntar.
    void navigator.storage?.persist?.().catch(() => {});
    this.#abrir().postMessage({ tipo: "load" });
  }

  /** El texto que generó el modelo. Rechaza si el worker falló o si no está listo. */
  generar(mensajes: Mensaje[]): Promise<string> {
    const e = this.#estado;
    if (e.fase !== "listo") return Promise.reject(new Error("El modelo no está listo."));
    return new Promise((resolver, rechazar) => {
      this.#pedido = { resolver, rechazar, parcial: "" };
      this.#poner({ fase: "generando", gpu: e.gpu, parcial: "" });
      this.#abrir().postMessage({ tipo: "generate", mensajes });
    });
  }

  /**
   * Termina el worker y libera el modelo. Una generación en curso se abandona (su promesa rechaza), así nada de lo que
   * termine después toca una vista que ya no está. Lo que se sabe de WebGPU queda: el botón sigue ahí.
   */
  cerrar() {
    this.#soltar();
  }

  /** Termina el worker, si hay uno: lo que diga después ya no cuenta (#abrir). Devuelve si había. */
  #terminar(): boolean {
    const w = this.#worker;
    if (!w) return false;
    w.terminate();
    this.#worker = undefined;
    return true;
  }

  /** Termina el worker y vuelve a "disponible" (con el error, si lo hubo). Cargar después abre uno nuevo. */
  #soltar(error?: string) {
    if (!this.#terminar()) return;
    const pedido = this.#pedido;
    this.#pedido = undefined;
    pedido?.rechazar(new Error(error ?? "Se cerró la AI."));
    const e = this.#estado;
    if ("gpu" in e) this.#poner(error ? { fase: "disponible", gpu: e.gpu, error } : { fase: "disponible", gpu: e.gpu });
  }
}

let compartido: ClienteAi | undefined;

/** El cliente de la pestaña. El worker sale como chunk aparte (Vite ve el new URL) y Transformers.js, como otro. */
export function clienteCompartido(): ClienteAi {
  compartido ??= new ClienteAi(
    () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerAi,
    () => typeof navigator !== "undefined" && "gpu" in navigator && typeof Worker !== "undefined",
  );
  return compartido;
}
