// La AI vista desde la página: el worker y un estado que React lee con useSyncExternalStore. Uno solo por pestaña
// (clienteCompartido): el modelo cargado en la GPU sobrevive a ir y volver de la consulta libre.
import { type AlWorker, type APagina, BYTES_DEL_MODELO, type Mensaje } from "./protocolo.ts";

export interface Progreso {
  archivo: string;
  cargado: number;
  total: number;
}

export type EstadoAi =
  | { fase: "revisando" }
  | { fase: "sin-webgpu"; motivo: string }
  | { fase: "disponible" }
  | { fase: "bajando"; progreso?: Progreso }
  | { fase: "preparando" }
  /** `error`: la última generación falló; el modelo sigue cargado. */
  | { fase: "listo"; error?: string }
  | { fase: "generando"; parcial: string }
  | { fase: "fallo-carga"; mensaje: string; pista: string };

/** Lo que el cliente usa de un Worker: así las pruebas le pasan uno falso. */
export interface WorkerAi {
  postMessage(m: AlWorker): void;
  addEventListener(tipo: "message", oyente: (e: MessageEvent<APagina>) => void): void;
  addEventListener(tipo: "error", oyente: (e: ErrorEvent) => void): void;
}

/** El porcentaje de la descarga. El total crece a medida que empieza cada archivo: se mide contra lo esperado. */
export const porcentaje = ({ cargado, total }: Progreso) =>
  Math.min(100, Math.floor((cargado / Math.max(total, BYTES_DEL_MODELO)) * 100));

/** Qué hacer después de un error de carga, en una frase. */
export function pistaDeCarga(mensaje: string, nombre = ""): string {
  if (/quota/i.test(nombre + mensaje)) {
    return "No queda lugar en el navegador para los 3,1 GB: liberá espacio en el teléfono y probá de nuevo.";
  }
  if (/fetch|network|load failed/i.test(mensaje)) {
    return "Se cortó la descarga. Con conexión, Probar de nuevo retoma: los archivos que ya bajaron quedan guardados.";
  }
  if (/gpu|device|adapter|webgpu/i.test(mensaje)) {
    return "La GPU no pudo con el modelo. Cerrá otras pestañas y probá de nuevo; si sigue, este dispositivo no alcanza.";
  }
  return "Probá de nuevo; si sigue, recargá la página.";
}

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
    w.addEventListener("message", (e) => this.#recibir(e.data));
    // El worker no arrancó (la CSP, un chunk que no llegó): en la revisión es "sin AI", después es un fallo de carga.
    w.addEventListener("error", (e) => {
      const mensaje = e.message || "El worker de la AI no arrancó.";
      if (this.#estado.fase === "revisando") this.#poner({ fase: "sin-webgpu", motivo: mensaje });
      else this.#recibir({ tipo: "error", cuando: "carga", mensaje });
    });
    return (this.#worker = w);
  }

  #recibir(m: APagina) {
    const e = this.#estado;
    if (m.tipo === "check") {
      if (e.fase === "revisando") {
        this.#poner(m.webgpu ? { fase: "disponible" } : { fase: "sin-webgpu", motivo: m.motivo ?? "" });
      }
    } else if (m.tipo === "progreso") {
      if (e.fase === "bajando") this.#poner({ fase: "bajando", progreso: m });
    } else if (m.tipo === "preparando") this.#poner({ fase: "preparando" });
    else if (m.tipo === "listo") this.#poner({ fase: "listo" });
    else if (m.tipo === "token" && this.#pedido) {
      this.#pedido.parcial += m.texto;
      this.#poner({ fase: "generando", parcial: this.#pedido.parcial });
    } else if (m.tipo === "generado" && this.#pedido) {
      const pedido = this.#pedido;
      this.#pedido = undefined;
      this.#poner({ fase: "listo" });
      pedido.resolver(m.texto);
    } else if (m.tipo === "error") {
      if (m.cuando === "generacion" || this.#pedido) {
        const pedido = this.#pedido;
        this.#pedido = undefined;
        this.#poner({ fase: "listo", error: m.mensaje });
        pedido?.rechazar(new Error(m.mensaje));
      } else this.#poner({ fase: "fallo-carga", mensaje: m.mensaje, pista: pistaDeCarga(m.mensaje, m.nombre) });
    }
  }

  /** Pregunta al worker si hay adaptador WebGPU. Una vez: después no hace nada. */
  revisar() {
    if (this.#estado.fase === "revisando" && !this.#worker) this.#abrir().postMessage({ tipo: "check" });
  }

  /** Baja (o lee del disco) el modelo. Solo después del aviso de tamaño: la UI lo llama desde Continuar. */
  cargar() {
    if (this.#estado.fase !== "disponible" && this.#estado.fase !== "fallo-carga") return;
    this.#poner({ fase: "bajando" });
    // Que el navegador no desaloje los 3,1 GB cuando le falte lugar. Chrome lo concede sin preguntar.
    void navigator.storage?.persist?.().catch(() => {});
    this.#abrir().postMessage({ tipo: "load" });
  }

  /** El texto que generó el modelo. Rechaza si el worker falló o si no está listo. */
  generar(mensajes: Mensaje[]): Promise<string> {
    if (this.#estado.fase !== "listo") return Promise.reject(new Error("El modelo no está listo."));
    return new Promise((resolver, rechazar) => {
      this.#pedido = { resolver, rechazar, parcial: "" };
      this.#poner({ fase: "generando", parcial: "" });
      this.#abrir().postMessage({ tipo: "generate", mensajes });
    });
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
