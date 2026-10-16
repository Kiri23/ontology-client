// "Preguntar con AI" montado en la consulta libre, con un worker falso y el motor de verdad. Prueba lo que promete la
// UI: sin WebGPU no hay botón, el aviso de 3,1 GB va antes de bajar nada, y lo generado va al editor y al validador,
// nunca al motor. Las respuestas que resuelven la promesa de generar van en un act asincrónico (act(() => Promise)).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi } from "../src/grafo/ai/cliente.ts";
import type { Grafo } from "../src/grafo/motor.ts";
import { ConsultaLibre } from "../src/grafo/vistas/ConsultaLibre.tsx";
import { grafoDePrueba } from "./grafo-de-prueba.ts";
import { workerFalso } from "./worker-falso.ts";

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

function montar(webgpu: boolean) {
  const f = workerFalso();
  const ai = new ClienteAi(() => f.worker, () => true);
  const vista = render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={ai} />);
  act(() => f.emitir({ tipo: "check", webgpu, motivo: webgpu ? undefined : "sin adaptador" }));
  return { ...f, ...vista };
}

/** Montada, con el modelo cargado y la pregunta hecha. Devuelve el worker para contestar. */
function preguntar(pregunta: string) {
  const m = montar(true);
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
    expect(screen.getByText(/necesita WebGPU, y este navegador no lo tiene/)).toBeTruthy();
    expect(recibidos).toEqual([{ tipo: "check" }]);
  });

  it("sin navigator.gpu ni siquiera abre el worker", () => {
    const crear = vi.fn(() => workerFalso().worker);
    render(<ConsultaLibre grafo={grafo} sparql="" ir={vi.fn()} ai={new ClienteAi(crear, () => false)} />);
    expect(screen.queryByRole("button", BOTON)).toBeNull();
    expect(crear).not.toHaveBeenCalled();
  });

  it("el aviso de 3,1 GB va antes de la descarga; Cancelar no baja nada", () => {
    const { recibidos, emitir } = montar(true);
    fireEvent.click(screen.getByRole("button", BOTON));
    expect(screen.getByText(/Baja 3,1 GB una sola vez y queda en el navegador/)).toBeTruthy();
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(recibidos.some((m) => m.tipo === "load")).toBe(false);
    fireEvent.click(screen.getByRole("button", BOTON));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(recibidos.at(-1)).toEqual({ tipo: "load" });
    act(() =>
      emitir({ tipo: "progreso", archivo: "onnx/decoder_model_merged_q4f16.onnx_data", cargado: 1.3e9, total: 1.5e9 })
    );
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("decoder_model_merged_q4f16.onnx_data · 41 %");
    expect(estado.textContent).toContain("1,3 de 3,1 GB");
    act(() => emitir({ tipo: "preparando" }));
    expect(screen.getByText(/Preparando el modelo en la GPU/)).toBeTruthy();
    act(() => emitir({ tipo: "listo" }));
    expect(screen.getByLabelText("Preguntá en castellano")).toBeTruthy();
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

  it("un error del worker al generar se explica y deja preguntar de nuevo", async () => {
    const m = preguntar("¿Qué acciones hay?");
    await act(() => Promise.resolve(m.emitir({ tipo: "error", cuando: "generacion", mensaje: "GPU device lost" })));
    expect(screen.getByRole("alert").textContent).toContain("La AI no pudo generar la consulta");
    expect((screen.getByRole("button", { name: "Generar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("un error al cargar dice qué pasó, cómo seguir, y reintenta", () => {
    const { recibidos, emitir } = montar(true);
    fireEvent.click(screen.getByRole("button", BOTON));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    act(() => emitir({ tipo: "error", cuando: "carga", mensaje: "Failed to fetch" }));
    expect(screen.getByRole("alert").textContent).toContain("Se cortó la descarga");
    fireEvent.click(screen.getByRole("button", { name: "Probar de nuevo" }));
    expect(recibidos.filter((m) => m.tipo === "load")).toHaveLength(2);
  });
});
