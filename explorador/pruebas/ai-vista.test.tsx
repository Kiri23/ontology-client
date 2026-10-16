// "Preguntar con AI" montado en la consulta libre, con un worker falso y el motor de verdad. Prueba lo que promete la
// UI: sin WebGPU no hay botón, el aviso de 293 MB (343 sin f16) va antes de bajar nada, y lo generado va al editor y al
// validador, nunca al motor. Las respuestas que resuelven la promesa de generar van en un act asincrónico (act(() => Promise)).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi } from "../src/grafo/ai/cliente.ts";
import { type Gpu, opcionesDeCarga } from "../src/grafo/ai/protocolo.ts";
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
const editor = () => (screen.getByLabelText("SPARQL") as HTMLTextAreaElement).value;

/** `gpu`: lo que contesta el check. Sin GPU, el worker dice que no hay adaptador. */
function montar(gpu: Gpu | false = GPU_DE_ESCRITORIO) {
  const f = workerFalso();
  const ai = new ClienteAi(() => f.worker, () => true);
  const ir = vi.fn();
  const vista = render(<ConsultaLibre grafo={grafo} sparql="" ir={ir} ai={ai} />);
  act(() => gpu ? f.conWebGpu(gpu) : f.emitir({ tipo: "check", webgpu: false, motivo: "sin adaptador" }));
  return { ...f, ...vista, ai, ir };
}

/** Montada, con el modelo cargado y la pregunta hecha. Devuelve el worker para contestar. */
function preguntar(pregunta: string) {
  const m = montar();
  fireEvent.click(screen.getByRole("button", BOTON));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  act(() => m.emitir({ tipo: "listo" }));
  fireEvent.change(screen.getByLabelText("Preguntá en castellano"), { target: { value: pregunta } });
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  return m;
}

describe("Preguntar con AI", () => {
  it("sin WebGPU no hay botón, y una línea dice por qué", () => {
    const { recibidos } = montar(false);
    expect(screen.queryByRole("button", BOTON)).toBeNull();
    expect(screen.getByText(/necesita WebGPU, y acá no está \(sin adaptador\)/)).toBeTruthy();
    expect(recibidos).toEqual([{ tipo: "check" }]);
  });

  it("sin navigator.gpu ni siquiera abre el worker", () => {
    const crear = vi.fn(() => workerFalso().worker);
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={new ClienteAi(crear, () => false)} />);
    expect(screen.queryByRole("button", BOTON)).toBeNull();
    expect(crear).not.toHaveBeenCalled();
  });

  it("el aviso de 293 MB va antes de la descarga; Cancelar no baja nada", () => {
    const { recibidos, emitir } = montar();
    fireEvent.click(screen.getByRole("button", BOTON));
    expect(screen.getByText(/Gemma 3 270M corre en este dispositivo/)).toBeTruthy();
    expect(screen.getByText(/Baja 293 MB una sola vez y queda en el navegador/)).toBeTruthy();
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", BOTON));
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
    fireEvent.click(screen.getByRole("button", BOTON));
    expect(screen.queryByText(/modo compatibilidad/)).toBeNull();
  });

  it("sin f16 y en modo compatibilidad (el Pixel), el aviso dice 343 MB y lo del modo, y Continuar carga igual", () => {
    const { recibidos, emitir } = montar(GPU_DEL_PIXEL);
    fireEvent.click(screen.getByRole("button", BOTON));
    expect(screen.getByText(/Baja 343 MB una sola vez y queda en el navegador/)).toBeTruthy();
    expect(screen.getByText(/solo en modo compatibilidad\. El modelo es el chico para que entre, pero así puede/))
      .toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(recibidos.at(-1)).toEqual({ tipo: "load" });
    act(() => emitir({ tipo: "variante", ...opcionesDeCarga(GPU_DEL_PIXEL) }));
    act(() => emitir({ tipo: "progreso", archivo: "onnx/model_q4.onnx_data", cargado: 1.2e8, total: 3.2e8 }));
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("model_q4.onnx_data · 34 %");
    expect(estado.textContent).toContain("120 MB de 343 MB");
    // La tabla de embeddings de Gemma 3 270M (84 MB) entra en los 256 MB del Pixel: no hay aviso.
    expect(estado.textContent).not.toContain("tabla de embeddings");
  });

  it("el tamaño de la descarga lo dice la variante del worker, y si la tabla de embeddings no entra, avisa", () => {
    const { emitir } = montar();
    fireEvent.click(screen.getByRole("button", BOTON));
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

  it("con la GPU perdida, el error queda a la vista y el botón carga de nuevo", async () => {
    const m = preguntar("¿Qué acciones hay?");
    await act(() => Promise.resolve(m.emitir({ tipo: "error", cuando: "generacion", mensaje: "GPUDevice lost" })));
    expect(screen.getByRole("alert").textContent).toContain("Se perdió la GPU y el modelo salió de la memoria");
    expect(m.estado.terminado).toBe(true);
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
    fireEvent.click(screen.getByRole("button", BOTON));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => emitir({ tipo: "error", cuando: "carga", mensaje: "Failed to fetch" }));
    expect(screen.getByRole("alert").textContent).toContain("Se cortó la descarga");
    fireEvent.click(screen.getByRole("button", { name: "Probar de nuevo" }));
    expect(recibidos.filter((m) => m.tipo === "load")).toHaveLength(2);
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
    fireEvent.click(screen.getByRole("button", BOTON));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => fakes[0].emitir({ tipo: "listo" }));
    primera.unmount();
    expect(fakes[0].estado.terminado).toBe(true);
    expect(ai.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
    // El worker viejo ya no cuenta: un "listo" atrasado no cambia el estado.
    fakes[0].emitir({ tipo: "listo" });
    expect(ai.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={ai} />);
    fireEvent.click(screen.getByRole("button", BOTON));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(fakes).toHaveLength(2);
    expect(fakes[1].recibidos).toEqual([{ tipo: "load" }]);
  });

  it("si el worker no arranca (la CSP lo bloquea), lo dice: no culpa a WebGPU", () => {
    const f = workerFalso();
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={new ClienteAi(() => f.worker, () => true)} />);
    act(() => f.fallar("Refused to load the script because it violates the Content Security Policy"));
    const alerta = screen.getByRole("alert").textContent;
    expect(alerta).toContain("no cargó su worker");
    expect(alerta).toContain("violates the Content Security Policy");
    expect(screen.queryByText(/necesita WebGPU/)).toBeNull();
    expect(screen.queryByRole("button", BOTON)).toBeNull();
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
