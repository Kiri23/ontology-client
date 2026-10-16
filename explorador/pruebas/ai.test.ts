// La AI sin modelo: el prompt (esquema del Store, ejemplos, pregunta), el extractor del SPARQL y el cliente con un
// worker falso. El modelo real no corre acá ni en chromium-box (colgó la VM): lo prueba Christian en el Pixel.
import { beforeAll, describe, expect, it } from "vitest";
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
import { validar } from "../src/grafo/logica/validador.ts";
import type { Grafo } from "../src/grafo/motor.ts";
import { grafoDePrueba } from "./grafo-de-prueba.ts";
import { workerFalso } from "./worker-falso.ts";

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
    f.emitir({ tipo: "check", webgpu: true });
    expect(cliente.estado().fase).toBe("disponible");
    cliente.cargar();
    expect(f.recibidos.at(-1)).toEqual({ tipo: "load" });
    f.emitir({ tipo: "progreso", archivo: "onnx/embed_tokens_q4f16.onnx_data", cargado: 1_565_000_000, total: 2e9 });
    expect(cliente.estado()).toMatchObject({ fase: "bajando", progreso: { cargado: 1_565_000_000 } });
    f.emitir({ tipo: "listo" });
    const texto = cliente.generar([{ role: "user", content: "hola" }]);
    f.emitir({ tipo: "token", texto: "SEL" });
    expect(cliente.estado()).toEqual({ fase: "generando", parcial: "SEL" });
    f.emitir({ tipo: "generado", texto: "SELECT" });
    await expect(texto).resolves.toBe("SELECT");
    expect(cliente.estado()).toEqual({ fase: "listo" });
  });

  it("un error al generar deja el modelo cargado; uno al cargar trae su pista", async () => {
    const f = workerFalso();
    const cliente = new ClienteAi(() => f.worker, () => true);
    cliente.revisar();
    f.emitir({ tipo: "check", webgpu: true });
    cliente.cargar();
    f.emitir({ tipo: "error", cuando: "carga", mensaje: "QuotaExceededError", nombre: "QuotaExceededError" });
    expect(cliente.estado()).toMatchObject({ fase: "fallo-carga", pista: expect.stringContaining("liberá espacio") });
    cliente.cargar();
    f.emitir({ tipo: "listo" });
    const texto = cliente.generar([]);
    f.emitir({ tipo: "error", cuando: "generacion", mensaje: "GPU device lost" });
    await expect(texto).rejects.toThrow("GPU device lost");
    expect(cliente.estado()).toEqual({ fase: "listo", error: "GPU device lost" });
  });

  it("el porcentaje se mide contra los 3,1 GB aunque el total todavía no los sume", () => {
    expect(porcentaje({ archivo: "", cargado: 1_565_000_000, total: 1_600_000_000 })).toBe(50);
    expect(porcentaje({ archivo: "", cargado: 4e9, total: 4e9 })).toBe(100);
    expect(pistaDeCarga("Failed to fetch")).toContain("retoma");
  });
});
