// "Preguntar con AI" montado en la consulta libre, con un worker falso, un servidor falso y el motor de verdad. Prueba
// lo que promete la UI: el botón pregunta al servidor en cualquier navegador y no le manda nada hasta Generar; el
// modelo de este dispositivo se ofrece solo con WebGPU core, y su aviso de 293 MB (343 sin f16) va antes de bajar nada;
// lo generado va al editor y al validador, nunca al motor. Las respuestas que resuelven la promesa de generar van en un
// act asincrónico (act(() => Promise)).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi } from "../src/grafo/ai/cliente.ts";
import { type Gpu, type Mensaje, opcionesDeCarga } from "../src/grafo/ai/protocolo.ts";
import { explicar, FalloDelServidor, type Pedir } from "../src/grafo/ai/servidor.ts";
import type { Grafo } from "../src/grafo/motor.ts";
import { ConsultaLibre } from "../src/grafo/vistas/ConsultaLibre.tsx";
import { grafoDePrueba } from "./grafo-de-prueba.ts";
import { GPU_DE_ESCRITORIO, GPU_DEL_PIXEL, workerFalso } from "./worker-falso.ts";

vi.mock("cytoscape-fcose", () => ({ default: {} }));
vi.mock("cytoscape", () => {
  const cadena = (): unknown =>
    new Proxy(function () {}, {
      get: (_, clave) => clave === Symbol.toPrimitive ? () => 0 : clave === "then" ? undefined : cadena(),
      apply: () => cadena(),
    });
  return { default: Object.assign(() => cadena(), { use: () => {} }) };
});

let grafo: Grafo;
beforeAll(async () => {
  grafo = await grafoDePrueba();
});
afterEach(cleanup);

const BOTON = { name: "Preguntar con AI" };
const DISPOSITIVO = { name: "Preguntar en este dispositivo" };
const editor = () => (screen.getByLabelText("SPARQL") as HTMLTextAreaElement).value;

/**
 * Un servidor falso: anota cada pedido y lo deja pendiente hasta que la prueba lo contesta (o lo rechaza) con
 * `contestar`. `pedidos[i].senal` es la del cliente: cerrar() la corta.
 */
function servidorFalso() {
  const pedidos: { mensajes: Mensaje[]; senal: AbortSignal; contestar(t: string): void; fallar(e: Error): void }[] = [];
  const pedir: Pedir = (mensajes, senal) =>
    new Promise((contestar, fallar) => pedidos.push({ mensajes, senal, contestar, fallar }));
  return { pedir, pedidos };
}

/** `gpu`: lo que contesta el check. Sin GPU, el worker dice que no hay adaptador. */
function montar(gpu: Gpu | false = GPU_DE_ESCRITORIO) {
  const f = workerFalso();
  const s = servidorFalso();
  const ai = new ClienteAi(() => f.worker, () => true, s.pedir);
  const ir = vi.fn();
  const vista = render(<ConsultaLibre grafo={grafo} sparql="" ir={ir} ai={ai} />);
  act(() => gpu ? f.conWebGpu(gpu) : f.emitir({ tipo: "check", webgpu: false, motivo: "sin adaptador" }));
  return { ...f, ...vista, ai, ir, pedidos: s.pedidos };
}

/** Escribe la pregunta y toca Generar. */
function hacerPregunta(pregunta: string) {
  fireEvent.change(screen.getByLabelText("Preguntá en castellano"), { target: { value: pregunta } });
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
}

/** Montada, con la pregunta hecha al servidor. Devuelve el servidor falso para contestar. */
function preguntarAlServidor(pregunta: string, gpu: Gpu | false = GPU_DE_ESCRITORIO) {
  const m = montar(gpu);
  fireEvent.click(screen.getByRole("button", BOTON));
  hacerPregunta(pregunta);
  return m;
}

/** Montada, con el modelo de este dispositivo cargado y la pregunta hecha. Devuelve el worker para contestar. */
function preguntar(pregunta: string) {
  const m = montar();
  fireEvent.click(screen.getByRole("button", DISPOSITIVO));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  act(() => m.emitir({ tipo: "listo" }));
  hacerPregunta(pregunta);
  return m;
}

describe("Preguntar con AI por el servidor", () => {
  it("abrir la pregunta no manda nada; Generar manda los mensajes y la consulta validada va al editor, sin correr", async () => {
    const m = montar();
    fireEvent.click(screen.getByRole("button", BOTON));
    expect(screen.getByText(/van al servidor de este sitio, que se los pasa a Gemma 4/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Preguntá en castellano"), { target: { value: "¿Cuántas acciones hay?" } });
    expect(m.pedidos).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(m.pedidos).toHaveLength(1);
    expect(m.pedidos[0].mensajes[0].content).toContain("Clases (instancias en el grafo)");
    expect(m.pedidos[0].mensajes.at(-1)).toEqual({ role: "user", content: "¿Cuántas acciones hay?" });
    expect(m.recibidos.some((r) => r.tipo === "load" || r.tipo === "generate")).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Preguntando a la AI");
    expect((screen.getByRole("button", { name: "Generando…" }) as HTMLButtonElement).disabled).toBe(true);
    const consulta = vi.spyOn(grafo.store, "query");
    await act(() => Promise.resolve(m.pedidos[0].contestar("```sparql\nASK { ?a a k:Action }\n```")));
    expect(editor()).toBe("PREFIX k: <https://kiri23.dev/catalogo#>\nASK { ?a a k:Action }");
    expect(screen.getByText(/el validador la deja correr\. Revisala y tocá Correr/)).toBeTruthy();
    expect(consulta.mock.calls.some(([q]) => q.includes("ASK { ?a a k:Action }"))).toBe(false);
    consulta.mockRestore();
  });

  it("sin WebGPU (y en el Pixel, con WebGPU de compatibilidad) el botón está y no se ofrece este dispositivo", () => {
    for (const gpu of [false, GPU_DEL_PIXEL] as const) {
      const m = montar(gpu);
      expect(screen.getByRole("button", BOTON)).toBeTruthy();
      expect(screen.queryByRole("button", DISPOSITIVO)).toBeNull();
      expect(screen.queryByText(/WebGPU|apagado/)).toBeNull();
      expect(m.recibidos).toEqual([{ tipo: "check" }]);
      m.unmount();
    }
  });

  it("el botón no espera al check de WebGPU, y sin navigator.gpu ni siquiera abre el worker", () => {
    const crear = vi.fn(() => workerFalso().worker);
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={new ClienteAi(crear, () => false)} />);
    expect(screen.getByRole("button", BOTON)).toBeTruthy();
    expect(crear).not.toHaveBeenCalled();
    cleanup();
    const f = workerFalso();
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={new ClienteAi(() => f.worker, () => true)} />);
    expect(f.recibidos).toEqual([{ tipo: "check" }]);
    expect(screen.getByRole("button", BOTON)).toBeTruthy();
  });

  it("un 429 dice cuántos segundos esperar, y la pregunta queda para mandarla de nuevo", async () => {
    const m = preguntarAlServidor("¿Qué acciones hay?", GPU_DEL_PIXEL);
    await act(() => Promise.resolve(m.pedidos[0].fallar(new FalloDelServidor(explicar(429, "x", "42")))));
    const alerta = screen.getByRole("alert").textContent;
    expect(alerta).toContain("La AI no pudo generar la consulta");
    expect(alerta).toContain("probá de nuevo en 42 s");
    expect((screen.getByLabelText("Preguntá en castellano") as HTMLTextAreaElement).value).toBe("¿Qué acciones hay?");
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(m.pedidos).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("una consulta rechazada por el validador queda en el editor con el motivo", async () => {
    const m = preguntarAlServidor("¿Qué acciones hay?");
    await act(() => Promise.resolve(m.pedidos[0].contestar("```sparql\nSELECT ?a WHERE { ?a a k:Accion }\n```")));
    expect(screen.getByRole("alert").textContent).toContain("La clase k:Accion no existe en el grafo");
  });

  it("salir mientras pregunta corta el pedido: la respuesta que llega después no escribe", async () => {
    const m = preguntarAlServidor("¿Cuántas acciones hay?");
    const llamadas = m.ir.mock.calls.length;
    m.unmount();
    expect(m.pedidos[0].senal.aborted).toBe(true);
    await act(() => Promise.resolve(m.pedidos[0].contestar("```sparql\nASK { ?a a k:Action }\n```")));
    expect(m.ir.mock.calls.length).toBe(llamadas);
    expect(m.ai.servidor()).toEqual({ fase: "libre" });
  });

  it("con el modelo de este dispositivo cargado, Usar el servidor lo suelta y abre la pregunta al servidor", () => {
    const m = preguntar("¿Qué acciones hay?");
    fireEvent.click(screen.getByRole("button", { name: "Usar el servidor" }));
    expect(m.estado.terminado).toBe(true);
    hacerPregunta("¿Cuántas acciones hay?");
    expect(m.pedidos).toHaveLength(1);
  });
});

describe("Preguntar con AI en este dispositivo", () => {
  it("el aviso de 293 MB va antes de la descarga; Cancelar no baja nada", () => {
    const { recibidos, emitir } = montar();
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    expect(screen.getByText(/Gemma 3 270M corre en este dispositivo/)).toBeTruthy();
    expect(screen.getByText(/Baja 293 MB una sola vez y queda en el navegador/)).toBeTruthy();
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(recibidos.at(-1)).toEqual({ tipo: "load" });
    act(() => emitir({ tipo: "progreso", archivo: "onnx/model_q4f16.onnx_data", cargado: 1.2e8, total: 2.7e8 }));
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("model_q4f16.onnx_data · 40 %");
    expect(estado.textContent).toContain("120 MB de 293 MB");
    act(() => emitir({ tipo: "preparando" }));
    expect(screen.getByText(/Preparando el modelo en la GPU/)).toBeTruthy();
    act(() => emitir({ tipo: "listo" }));
    expect(screen.getByLabelText("Preguntá en castellano")).toBeTruthy();
  });

  it("el aviso con f16 no habla del modo compatibilidad", () => {
    montar();
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    expect(screen.queryByText(/modo compatibilidad/)).toBeNull();
  });

  it("en core sin f16, el aviso dice 343 MB, Continuar carga q4 y la tabla de embeddings entra (sin aviso)", () => {
    const sinF16: Gpu = { modo: "core", f16: false, maxStorageBufferBindingSize: 134_217_728 };
    const { recibidos, emitir } = montar(sinF16);
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    expect(screen.getByText(/Baja 343 MB una sola vez y queda en el navegador/)).toBeTruthy();
    expect(screen.queryByText(/apagado en este dispositivo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(recibidos.at(-1)).toEqual({ tipo: "load" });
    act(() => emitir({ tipo: "variante", ...opcionesDeCarga(sinF16) }));
    act(() => emitir({ tipo: "progreso", archivo: "onnx/model_q4.onnx_data", cargado: 1.2e8, total: 3.2e8 }));
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("model_q4.onnx_data · 34 %");
    expect(estado.textContent).toContain("120 MB de 343 MB");
    // La tabla de embeddings de Gemma 3 270M (80 MiB) entra en los 128 MiB que WebGPU garantiza: no hay aviso.
    expect(estado.textContent).not.toContain("tabla de embeddings");
  });

  it("el tamaño de la descarga lo dice la variante del worker, y si la tabla de embeddings no entra, avisa", () => {
    const { emitir } = montar();
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => emitir({ tipo: "variante", ...opcionesDeCarga({ f16: false, maxStorageBufferBindingSize: 2 ** 26 }) }));
    act(() => emitir({ tipo: "progreso", archivo: "onnx/model_q4.onnx_data", cargado: 1.2e8, total: 3.2e8 }));
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("120 MB de 343 MB");
    const aviso = "La tabla de embeddings (80 MB) supera lo que la GPU acepta por buffer (64 MB): puede fallar al " +
      "cargar; si falla, el error va a decir maxStorageBufferBindingSize.";
    expect(estado.textContent).toContain(aviso);
  });

  it("una consulta válida va al editor con sus PREFIX y el veredicto, pero no corre", async () => {
    const m = preguntar("¿Cuántas acciones hay?");
    const pedido = m.recibidos.at(-1);
    expect(pedido?.tipo === "generate" && pedido.mensajes.at(-1)?.content).toBe("¿Cuántas acciones hay?");
    const consulta = vi.spyOn(grafo.store, "query");
    act(() => m.emitir({ tipo: "token", texto: "```sparql\nSELECT" }));
    expect(screen.getByLabelText("Lo que va escribiendo la AI").textContent).toContain("SELECT");
    await act(() =>
      Promise.resolve(
        m.emitir({ tipo: "generado", texto: "```sparql\nSELECT (COUNT(?a) AS ?n) WHERE { ?a a k:Action }\n```" }),
      )
    );
    expect(editor()).toBe("PREFIX k: <https://kiri23.dev/catalogo#>\nSELECT (COUNT(?a) AS ?n) WHERE { ?a a k:Action }");
    expect(screen.getByText(/el validador la deja correr\. Revisala y tocá Correr/)).toBeTruthy();
    expect(consulta.mock.calls.some(([q]) => q.includes("COUNT(?a)"))).toBe(false);
    expect(m.container.querySelector(".resultado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    expect(consulta.mock.calls.some(([q]) => q.includes("COUNT(?a)"))).toBe(true);
    consulta.mockRestore();
  });

  it("una consulta rechazada queda en el editor con el motivo, para corregirla", async () => {
    const m = preguntar("¿Qué acciones hay?");
    const consulta = vi.spyOn(grafo.store, "query");
    await act(() =>
      Promise.resolve(m.emitir({ tipo: "generado", texto: "```sparql\nSELECT ?a WHERE { ?a a k:Accion }\n```" }))
    );
    expect(editor()).toContain("SELECT ?a WHERE { ?a a k:Accion }");
    const alerta = screen.getByRole("alert").textContent;
    expect(alerta).toContain("La propuso la AI: quedó en el editor para que la corrijas.");
    expect(alerta).toContain("La clase k:Accion no existe en el grafo; parecida: k:Action.");
    expect(consulta).not.toHaveBeenCalled();
    consulta.mockRestore();
  });

  it("con la GPU perdida, el error queda a la vista, el botón del dispositivo carga de nuevo y el servidor sigue", async () => {
    const m = preguntar("¿Qué acciones hay?");
    await act(() => Promise.resolve(m.emitir({ tipo: "error", cuando: "generacion", mensaje: "GPUDevice lost" })));
    expect(screen.getByRole("alert").textContent).toContain("Se perdió la GPU y el modelo salió de la memoria");
    expect(m.estado.terminado).toBe(true);
    expect(screen.getByRole("button", DISPOSITIVO)).toBeTruthy();
    expect(screen.getByRole("button", BOTON)).toBeTruthy();
  });

  it("un error del worker al generar se explica y deja preguntar de nuevo", async () => {
    const m = preguntar("¿Qué acciones hay?");
    await act(() => Promise.resolve(m.emitir({ tipo: "error", cuando: "generacion", mensaje: "Generación cortada" })));
    expect(screen.getByRole("alert").textContent).toContain("La AI no pudo generar la consulta");
    expect((screen.getByRole("button", { name: "Generar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("un error al cargar dice qué pasó, cómo seguir, y reintenta", () => {
    const { recibidos, emitir } = montar();
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => emitir({ tipo: "error", cuando: "carga", mensaje: "Failed to fetch" }));
    expect(screen.getByRole("alert").textContent).toContain("Se cortó la descarga");
    fireEvent.click(screen.getByRole("button", { name: "Probar de nuevo" }));
    expect(recibidos.filter((m) => m.tipo === "load")).toHaveLength(2);
  });

  it("después de un error al cargar, Usar el servidor abre la pregunta al servidor", () => {
    const m = montar();
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => m.emitir({ tipo: "error", cuando: "carga", mensaje: "Failed to fetch" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar el servidor" }));
    hacerPregunta("¿Cuántas acciones hay?");
    expect(m.pedidos).toHaveLength(1);
    expect(screen.getByRole("button", DISPOSITIVO)).toBeTruthy();
  });

  it("salir mientras genera abandona la generación: al terminar no escribe ni vuelve a #/grafo/consulta", async () => {
    const m = preguntar("¿Cuántas acciones hay?");
    const llamadas = m.ir.mock.calls.length;
    m.unmount();
    expect(m.estado.terminado).toBe(true);
    await act(() => Promise.resolve(m.emitir({ tipo: "generado", texto: "```sparql\nASK { ?a a k:Action }\n```" })));
    expect(m.ir.mock.calls.length).toBe(llamadas);
  });

  it("al desmontar termina el worker y libera el modelo; volver abre uno nuevo, sin repetir el check", () => {
    const fakes: ReturnType<typeof workerFalso>[] = [];
    const ai = new ClienteAi(() => (fakes.push(workerFalso()), fakes.at(-1)!.worker), () => true);
    const primera = render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={ai} />);
    act(() => fakes[0].conWebGpu());
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => fakes[0].emitir({ tipo: "listo" }));
    primera.unmount();
    expect(fakes[0].estado.terminado).toBe(true);
    expect(ai.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
    // El worker viejo ya no cuenta: un "listo" atrasado no cambia el estado.
    fakes[0].emitir({ tipo: "listo" });
    expect(ai.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={ai} />);
    fireEvent.click(screen.getByRole("button", DISPOSITIVO));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(fakes).toHaveLength(2);
    expect(fakes[1].recibidos).toEqual([{ tipo: "load" }]);
  });

  it("si el worker no arranca (la CSP lo bloquea), no se ofrece este dispositivo y el servidor sigue", () => {
    const f = workerFalso();
    const ai = new ClienteAi(() => f.worker, () => true);
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={ai} />);
    act(() => f.fallar("Refused to load the script because it violates the Content Security Policy"));
    expect(ai.estado().fase).toBe("sin-worker");
    expect(screen.queryByRole("button", DISPOSITIVO)).toBeNull();
    expect(screen.getByRole("button", BOTON)).toBeTruthy();
  });

  it("editar la consulta propuesta borra el veredicto de la AI", async () => {
    const m = preguntar("¿Cuántas acciones hay?");
    await act(() => Promise.resolve(m.emitir({ tipo: "generado", texto: "```sparql\nASK { ?a a k:Action }\n```" })));
    expect(screen.getByText(/el validador la deja correr/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("SPARQL"), { target: { value: editor() + " " } });
    expect(screen.queryByText(/el validador la deja correr/)).toBeNull();
  });

  it("editar una propuesta rechazada borra el 'la propuso la AI'", async () => {
    const m = preguntar("¿Qué acciones hay?");
    await act(() =>
      Promise.resolve(m.emitir({ tipo: "generado", texto: "```sparql\nSELECT ?a WHERE { ?a a k:Accion }\n```" }))
    );
    expect(screen.getByText(/La propuso la AI/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("SPARQL"), { target: { value: editor().replace("Accion", "Action") } });
    expect(screen.queryByText(/La propuso la AI/)).toBeNull();
  });
});
