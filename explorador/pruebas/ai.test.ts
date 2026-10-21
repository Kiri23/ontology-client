// La AI sin modelo: el prompt (esquema del Store, ejemplos, pregunta), el extractor del SPARQL y el cliente con un
// worker falso. El modelo real no corre acá ni en chromium-box (colgó la VM): lo prueba Christian en el Pixel.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi, pistaDeCarga, porcentaje } from "../src/grafo/ai/cliente.ts";
import { completarPrefijos, consultaPropuesta, extraerSparql } from "../src/grafo/ai/extraer.ts";
import { Store } from "oxigraph/web.js";
import {
  armarMensajes,
  type Consultar,
  EJEMPLOS,
  type Esquema,
  leerEsquema,
  literalSparql,
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
  esquema = leerEsquema((q) => grafo.store.query(q) as ReturnType<Consultar>);
});

describe("esquema del prompt", () => {
  it("las clases con sus instancias, sin las del esquema mismo (rdf:Property, rdfs:Class)", () => {
    const clases = Object.fromEntries(esquema.clases.map((c) => [c.iri.replace(/^.*[#/]/, ""), c.instancias]));
    expect(clases).toEqual({ JobPost: 131, Uso: 43, Workflow: 21, Project: 15, Technology: 15, Action: 10 });
  });

  it("cada propiedad con su dominio, rango y comentario; si no declara dominio, las clases que la usan", () => {
    const texto = textoDelEsquema(esquema);
    expect(texto).toContain("- ontologia:accion: ontologia:Uso → ontologia:Action. El uso apunta a esta action.");
    expect(texto).toContain("- ontologia:pide: ontologia:JobPost → ontologia:Technology.");
    expect(texto).toContain("- rdfs:label: ontologia:JobPost → ?.");
    expect(texto).toContain("- ontologia:JobPost (131): Un puesto publicado");
    expect(texto).toContain("k: <https://kiri231.com/ontologia#>");
    // rdf:type va como `a`, y las propiedades que solo usa el esquema (rdfs:domain, rdfs:range) no se preguntan.
    expect(texto).not.toMatch(/- rdf:type|- rdfs:domain|- rdfs:range/);
  });

  it("las propiedades con pocos literales llevan sus valores, tal cual van en SPARQL; las de muchos, no", () => {
    const texto = textoDelEsquema(esquema);
    // La procedencia de cada carga (<urn:kiri-jobs:hn:…> dcterms:source "kiri-jobs -j (hn)") no tiene clase: no va.
    expect(texto).toContain('- dcterms:source: ontologia:JobPost → ?. Valores: "hn", "remotive".');
    expect(texto).toMatch(/- ontologia:esPublico: [^\n]* Valores: false, true\.$/m);
    // rdfs:label tiene 132 distintos y ontologia:empresa 125: ninguno lleva lista.
    expect(texto).not.toMatch(/- (rdfs:label|ontologia:empresa): [^\n]*Valores/);
    expect(armarMensajes(esquema, "x")[0].content).toContain(
      "escribí el literal igual que ahí, con las mismas mayúsculas",
    );
  });

  it('los valores salen del Store: "hn" y "remotive" sí; 11 distintos, uno largo o un sujeto sin clase, no', () => {
    const store = new Store();
    const puestos = Array.from(
      { length: 11 },
      (_, i) =>
        `ontologia:p${i} a ontologia:JobPost ; ontologia:empresa "Empresa ${i}" ; dcterms:source "${
          i % 2 ? "hn" : "remotive"
        }" .`,
    );
    store.load(
      `@prefix j: <https://kiri231.com/ontologia#> . @prefix dcterms: <http://purl.org/dc/terms/> .
       @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
       ${puestos.join("\n")}
       ontologia:p0 rdfs:comment "${"una descripción larga ".repeat(3)}" .
       <urn:carga> dcterms:source "procedencia, sin clase" .`,
      { format: "text/turtle" },
    );
    const texto = textoDelEsquema(leerEsquema((q) => store.query(q) as ReturnType<Consultar>));
    expect(texto).toContain('- dcterms:source: ontologia:JobPost → ?. Valores: "hn", "remotive".');
    expect(texto).toMatch(/- ontologia:empresa: ontologia:JobPost → \?\.$/m);
    expect(texto).toMatch(/- rdfs:comment: ontologia:JobPost → \?\.$/m);
  });

  it("un literal como se escribe en SPARQL: con comillas, idioma o tipo; booleanos y enteros, sueltos", () => {
    const xsd = (t: string) => ({ value: "http://www.w3.org/2001/XMLSchema#" + t });
    const l = (value: string, datatype?: { value: string }, language?: string) =>
      literalSparql({ termType: "Literal", value, datatype, language });
    expect(l("hn", xsd("string"))).toBe('"hn"');
    expect(l('di "hola"')).toBe('"di \\"hola\\""');
    expect(l("hola", undefined, "es")).toBe('"hola"@es');
    expect(l("true", xsd("boolean"))).toBe("true");
    expect(l("42", xsd("integer"))).toBe("42");
    expect(l("2026-10-12T15:49:24Z", xsd("dateTime"))).toBe('"2026-10-12T15:49:24Z"^^xsd:dateTime');
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
    const texto = "Claro:\n```text\nnada\n```\n```sparql\nSELECT ?a WHERE { ?a a ontologia:Action }\n```\nListo.";
    expect(extraerSparql(texto)).toBe("SELECT ?a WHERE { ?a a ontologia:Action }");
  });

  it("un bloque sin lenguaje, uno que quedó abierto (max_new_tokens) y el texto crudo", () => {
    expect(extraerSparql("```\nASK { ?a a ontologia:Uso }\n```")).toBe("ASK { ?a a ontologia:Uso }");
    expect(extraerSparql("```sparql\nSELECT ?a WHERE {\n  ?a a ontologia:Uso")).toBe(
      "SELECT ?a WHERE {\n  ?a a ontologia:Uso",
    );
    expect(extraerSparql("La consulta es: SELECT ?x WHERE { ?x a ontologia:JobPost }")).toBe(
      "SELECT ?x WHERE { ?x a ontologia:JobPost }",
    );
    expect(extraerSparql("No sé.")).toBe("");
  });

  it("agrega los PREFIX que faltan y no repite los que el modelo ya escribió", () => {
    const q =
      "PREFIX k: <https://kiri231.com/ontologia#>\nSELECT ?p WHERE { ?p ontologia:tieneWorkflow ?w . ?p a doap:Project }";
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

  it("el OrtRun que falla porque Dawn perdió el device (el Pixel 10 con 270M) es GPU perdida, no un error de generar", async () => {
    const fakes: ReturnType<typeof workerFalso>[] = [];
    const cliente = new ClienteAi(() => (fakes.push(workerFalso()), fakes.at(-1)!.worker), () => true);
    cliente.revisar();
    fakes[0].conWebGpu(GPU_DEL_PIXEL);
    cliente.cargar();
    fakes[0].emitir({ tipo: "listo" });
    const texto = cliente.generar([{ role: "user", content: "hola" }]);
    const mensaje = "failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: …/webgpu/buffer_manager.cc:605 … " +
      "BufferManager::Download … Failed to create a WebGPU compute pipeline: A valid external Instance reference no " +
      "longer exists";
    fakes[0].emitir({ tipo: "error", cuando: "generacion", mensaje });
    await expect(texto).rejects.toThrow("external Instance reference");
    expect(fakes[0].estado.terminado).toBe(true);
    expect(cliente.estado()).toEqual({ fase: "disponible", gpu: GPU_DEL_PIXEL, error: mensaje });
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
