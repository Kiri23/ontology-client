// La AI sin modelo: el prompt (esquema del Store, ejemplos, pregunta), el extractor del SPARQL y el cliente con un
// worker falso. El modelo real no corre acá ni en chromium-box (colgó la VM): lo prueba Christian en el Pixel.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi, pistaDeCarga, porcentaje } from "../src/grafo/ai/cliente.ts";
import { completarPrefijos, consultaPropuesta, extraerSparql } from "../src/grafo/ai/extraer.ts";
import {
  armarMensajes,
  EJEMPLOS,
  type Esquema,
  leerEsquema,
  sinPrefijos,
  textoDelEsquema,
} from "../src/grafo/ai/prompt.ts";
import { bytesDelModelo, opcionesDeCarga } from "../src/grafo/ai/protocolo.ts";
import { validar } from "../src/grafo/logica/validador.ts";
import type { Grafo } from "../src/grafo/motor.ts";
import { grafoDePrueba } from "./grafo-de-prueba.ts";
import { renderizarParaGemma } from "./plantilla-gemma.ts";
import { GPU_DE_ESCRITORIO, GPU_DEL_PIXEL, workerFalso } from "./worker-falso.ts";

let grafo: Grafo;
let esquema: Esquema;

beforeAll(async () => {
  grafo = await grafoDePrueba();
  esquema = leerEsquema((q) => grafo.store.query(q) as Map<string, { value: string }>[]);
});

describe("esquema del prompt", () => {
  it("las clases con sus instancias, sin las del esquema mismo (rdf:Property, rdfs:Class)", () => {
    const clases = Object.fromEntries(esquema.clases.map((c) => [c.iri.replace(/^.*[#/]/, ""), c.instancias]));
    expect(clases).toEqual({ JobPost: 131, Uso: 43, Workflow: 21, Project: 15, Technology: 15, Action: 10 });
  });

  it("cada propiedad con su dominio, rango y comentario; si no declara dominio, las clases que la usan", () => {
    const texto = textoDelEsquema(esquema);
    expect(texto).toContain("- k:accion: k:Uso → k:Action. El uso apunta a esta action.");
    expect(texto).toContain("- j:pide: j:JobPost → t:Technology.");
    expect(texto).toContain("- rdfs:label: j:JobPost → ?.");
    expect(texto).toContain("- j:JobPost (131): Un puesto publicado");
    expect(texto).toContain("k: <https://kiri23.dev/catalogo#>");
    // rdf:type va como `a`, y las propiedades que solo usa el esquema (rdfs:domain, rdfs:range) no se preguntan.
    expect(texto).not.toMatch(/- rdf:type|- rdfs:domain|- rdfs:range/);
  });

  it("los mensajes: sistema con reglas y esquema, tres ejemplos sin PREFIX y la pregunta al final", () => {
    const mensajes = armarMensajes(esquema, "  ¿Cuántas acciones hay?  ");
    expect(mensajes.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect(mensajes[0].content).toContain("SOLO la consulta, en un bloque ```sparql");
    expect(mensajes[0].content).toContain("Clases (instancias en el grafo)");
    expect(mensajes[1].content).toBe(EJEMPLOS[0].pregunta);
    expect(mensajes[2].content).toMatch(/^```sparql\nSELECT[\s\S]*\n```$/);
    expect(mensajes.filter((m) => m.role === "assistant").some((m) => /PREFIX/i.test(m.content))).toBe(false);
    expect(mensajes.at(-1)).toEqual({ role: "user", content: "¿Cuántas acciones hay?" });
  });

  it("cada ejemplo, con sus PREFIX completados de nuevo, pasa el validador", () => {
    for (const e of EJEMPLOS) expect(validar(completarPrefijos(sinPrefijos(e.sparql)), grafo.conocidas).ok).toBe(true);
  });
});

describe("plantilla de chat de Gemma 3 (la real, sin el modelo)", () => {
  it("acepta la conversación entera que arma el worker y deja abierto el turno del modelo", () => {
    const prompt = renderizarParaGemma(armarMensajes(esquema, "¿Cuántas acciones hay?"));
    // Gemma 3 no tiene turno de system: lo pega al primer user, separado por una línea en blanco.
    expect(prompt.startsWith("<bos><start_of_turn>user\nTraducís preguntas en castellano")).toBe(true);
    expect(prompt).toContain("Clases (instancias en el grafo)");
    expect(prompt).toContain(`\n\n${EJEMPLOS[0].pregunta}<end_of_turn>\n<start_of_turn>model\n\`\`\`sparql\n`);
    expect(prompt.match(/<start_of_turn>model\n/g)).toHaveLength(EJEMPLOS.length + 1);
    expect(prompt.endsWith("<start_of_turn>user\n¿Cuántas acciones hay?<end_of_turn>\n<start_of_turn>model\n"))
      .toBe(true);
  });

  it("la plantilla es la real: rechaza turnos que no alternan user y assistant", () => {
    const mensajes = [{ role: "user", content: "a" }, { role: "user", content: "b" }] as const;
    expect(() => renderizarParaGemma([...mensajes])).toThrow("Conversation roles must alternate");
  });
});

describe("extractor", () => {
  it("saca el bloque ```sparql aunque haya texto y otros bloques alrededor", () => {
    const texto = "Claro:\n```text\nnada\n```\n```sparql\nSELECT ?a WHERE { ?a a k:Action }\n```\nListo.";
    expect(extraerSparql(texto)).toBe("SELECT ?a WHERE { ?a a k:Action }");
  });

  it("un bloque sin lenguaje, uno que quedó abierto (max_new_tokens) y el texto crudo", () => {
    expect(extraerSparql("```\nASK { ?a a k:Uso }\n```")).toBe("ASK { ?a a k:Uso }");
    expect(extraerSparql("```sparql\nSELECT ?a WHERE {\n  ?a a k:Uso")).toBe("SELECT ?a WHERE {\n  ?a a k:Uso");
    expect(extraerSparql("La consulta es: SELECT ?x WHERE { ?x a j:JobPost }")).toBe(
      "SELECT ?x WHERE { ?x a j:JobPost }",
    );
    expect(extraerSparql("No sé.")).toBe("");
  });

  it("agrega los PREFIX que faltan y no repite los que el modelo ya escribió", () => {
    const q = "PREFIX k: <https://kiri23.dev/catalogo#>\nSELECT ?p WHERE { ?p k:tieneWorkflow ?w . ?p a doap:Project }";
    const completa = completarPrefijos(q);
    expect(completa.match(/PREFIX k:/g)).toHaveLength(1);
    expect(completa.startsWith("PREFIX doap: <http://usefulinc.com/ns/doap#>\n")).toBe(true);
    expect(completarPrefijos("ASK { ?s ?p ?o }")).toBe("ASK { ?s ?p ?o }");
  });

  it("sin SPARQL, lo que dijo el modelo va tal cual al editor (y el validador lo rechaza)", () => {
    expect(consultaPropuesta("  No puedo con eso.  ")).toBe("No puedo con eso.");
    expect(validar(consultaPropuesta("No puedo con eso."), grafo.conocidas).ok).toBe(false);
  });
});

describe("cliente", () => {
  it("sin navigator.gpu no abre el worker", () => {
    let abiertos = 0;
    const cliente = new ClienteAi(() => (abiertos++, workerFalso().worker), () => false);
    cliente.revisar();
    expect(cliente.estado().fase).toBe("sin-webgpu");
    expect(abiertos).toBe(0);
  });

  it("revisar → check; cargar → load con progreso; generar resuelve con el texto", async () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    expect(f.recibidos).toEqual([{ tipo: "check" }]);
    f.conWebGpu();
    expect(cliente.estado().fase).toBe("disponible");
    cliente.cargar();
    expect(f.recibidos.at(-1)).toEqual({ tipo: "load" });
    f.emitir({ tipo: "progreso", archivo: "onnx/model_q4f16.onnx_data", cargado: 146_000_000, total: 2.9e8 });
    expect(cliente.estado()).toMatchObject({ fase: "bajando", progreso: { cargado: 146_000_000 } });
    f.emitir({ tipo: "listo" });
    const texto = cliente.generar([{ role: "user", content: "hola" }]);
    f.emitir({ tipo: "token", texto: "SEL" });
    expect(cliente.estado()).toEqual({ fase: "generando", gpu: GPU_DE_ESCRITORIO, parcial: "SEL" });
    f.emitir({ tipo: "generado", texto: "SELECT" });
    await expect(texto).resolves.toBe("SELECT");
    expect(cliente.estado()).toEqual({ fase: "listo", gpu: GPU_DE_ESCRITORIO });
  });

  it("un error al generar deja el modelo cargado; uno al cargar trae su pista", async () => {
    const fakes: ReturnType<typeof workerFalso>[] = [];
    const cliente = new ClienteAi(() => (fakes.push(workerFalso()), fakes.at(-1)!.worker), () => true);
    cliente.revisar();
    fakes[0].conWebGpu();
    cliente.cargar();
    fakes[0].emitir({ tipo: "error", cuando: "carga", mensaje: "QuotaExceededError", nombre: "QuotaExceededError" });
    expect(cliente.estado()).toMatchObject({ fase: "fallo-carga", pista: expect.stringContaining("liberá espacio") });
    cliente.cargar();
    const f = fakes[1];
    f.emitir({ tipo: "listo" });
    const texto = cliente.generar([{ role: "user", content: "hola" }]);
    f.emitir({ tipo: "error", cuando: "generacion", mensaje: "out of tokens" });
    await expect(texto).rejects.toThrow("out of tokens");
    expect(cliente.estado()).toEqual({ fase: "listo", gpu: GPU_DE_ESCRITORIO, error: "out of tokens" });
    expect(f.estado.terminado).toBe(false);
  });

  it("con la GPU perdida termina el worker y vuelve a sin cargar, con el error; cargar abre uno nuevo", async () => {
    const fakes: ReturnType<typeof workerFalso>[] = [];
    const cliente = new ClienteAi(() => (fakes.push(workerFalso()), fakes.at(-1)!.worker), () => true);
    cliente.revisar();
    fakes[0].conWebGpu();
    cliente.cargar();
    fakes[0].emitir({ tipo: "listo" });
    const texto = cliente.generar([{ role: "user", content: "hola" }]);
    fakes[0].emitir({ tipo: "error", cuando: "generacion", mensaje: "GPU device was lost: unknown" });
    await expect(texto).rejects.toThrow("device was lost");
    expect(fakes[0].estado.terminado).toBe(true);
    expect(cliente.estado()).toEqual({
      fase: "disponible",
      gpu: GPU_DE_ESCRITORIO,
      error: "GPU device was lost: unknown",
    });
    cliente.cargar();
    expect(fakes).toHaveLength(2);
    expect(fakes[1].recibidos).toEqual([{ tipo: "load" }]);
  });

  it("el porcentaje se mide contra lo que pesa la variante que baja, aunque el total todavía no lo sume", () => {
    expect(porcentaje({ archivo: "", cargado: 146_640_000, total: 280_000_000 }, bytesDelModelo(true))).toBe(50);
    expect(porcentaje({ archivo: "", cargado: 146_640_000, total: 280_000_000 }, bytesDelModelo(false))).toBe(42);
    expect(porcentaje({ archivo: "", cargado: 4e8, total: 4e8 }, bytesDelModelo(false))).toBe(100);
    expect(pistaDeCarga("Failed to fetch")).toContain("retoma");
  });

  it("el check guarda el modo y el f16, y siguen ahí al cargar y al perder la GPU", () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    f.conWebGpu(GPU_DEL_PIXEL);
    expect(cliente.estado()).toEqual({ fase: "disponible", gpu: GPU_DEL_PIXEL });
    cliente.cargar();
    expect(cliente.estado()).toEqual({ fase: "bajando", gpu: GPU_DEL_PIXEL });
    f.emitir({ tipo: "variante", ...opcionesDeCarga(GPU_DEL_PIXEL) });
    f.emitir({ tipo: "progreso", archivo: "onnx/model_q4.onnx_data", cargado: 1e8, total: 2e8 });
    expect(cliente.estado()).toEqual({
      fase: "bajando",
      gpu: GPU_DEL_PIXEL,
      variante: opcionesDeCarga(GPU_DEL_PIXEL),
      progreso: { tipo: "progreso", archivo: "onnx/model_q4.onnx_data", cargado: 1e8, total: 2e8 },
    });
    f.emitir({ tipo: "error", cuando: "carga", mensaje: "GPU device lost (unknown): pantalla apagada" });
    expect(cliente.estado()).toEqual({
      fase: "disponible",
      gpu: GPU_DEL_PIXEL,
      error: "GPU device lost (unknown): pantalla apagada",
    });
  });

  it("un error al cargar termina el worker: Probar de nuevo abre uno limpio, y la pista no promete que se arregle", () => {
    const fakes: ReturnType<typeof workerFalso>[] = [];
    const cliente = new ClienteAi(() => (fakes.push(workerFalso()), fakes.at(-1)!.worker), () => true);
    cliente.revisar();
    fakes[0].conWebGpu(GPU_DEL_PIXEL);
    cliente.cargar();
    const mensaje = "Buffer declares a size of 1174405120 bytes, exceeding maxStorageBufferBindingSize of 268435456";
    fakes[0].emitir({ tipo: "error", cuando: "carga", mensaje });
    expect(fakes[0].estado.terminado).toBe(true);
    expect(cliente.estado()).toMatchObject({ fase: "fallo-carga", pista: expect.stringContaining("suele repetirse") });
    // Lo que diga el worker terminado ya no cuenta.
    fakes[0].emitir({ tipo: "listo" });
    expect(cliente.estado().fase).toBe("fallo-carga");
    cliente.cargar();
    expect(fakes).toHaveLength(2);
    expect(fakes[1].recibidos).toEqual([{ tipo: "load" }]);
    expect(pistaDeCarga("Failed to fetch")).toContain("retoma");
  });

  it("un error de carga con el worker ocioso (sin Continuar) no es un fallo de carga: solo un aviso en la consola", () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente.revisar();
    f.conWebGpu();
    f.emitir({ tipo: "error", cuando: "carga", mensaje: "una promesa sin atrapar" });
    expect(cliente.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
    expect(f.estado.terminado).toBe(false);
    expect(aviso).toHaveBeenCalledWith(expect.any(String), "una promesa sin atrapar");
    aviso.mockRestore();
  });

  it("un segundo cargar mientras baja no manda otro load", () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    f.conWebGpu();
    cliente.cargar();
    cliente.cargar();
    f.emitir({ tipo: "preparando" });
    cliente.cargar();
    expect(f.recibidos.filter((m) => m.tipo === "load")).toHaveLength(1);
  });

  it("generar fuera de listo rechaza y no le manda nada al worker", async () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    f.conWebGpu();
    await expect(cliente.generar([{ role: "user", content: "hola" }])).rejects.toThrow("no está listo");
    expect(f.recibidos.some((m) => m.tipo === "generate")).toBe(false);
    expect(cliente.estado()).toEqual({ fase: "disponible", gpu: GPU_DE_ESCRITORIO });
  });

  it("el worker que no arranca en la revisión deja sin-worker con el motivo; después, es un fallo de carga", () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    f.fallar("bloqueado por la CSP");
    expect(cliente.estado()).toEqual({ fase: "sin-worker", motivo: "bloqueado por la CSP" });
    const g = workerFalso();
    const otro = new ClienteAi(() => g.worker, () => true);
    otro.revisar();
    g.conWebGpu();
    otro.cargar();
    g.fallar("");
    expect(otro.estado()).toMatchObject({ fase: "fallo-carga", mensaje: "El worker de la AI no arrancó." });
  });
});
