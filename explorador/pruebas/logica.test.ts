// La lógica pura: la ruta del hash, la tabla y los helpers de las historias.
import { describe, expect, it } from "vitest";
import { opcional, pares } from "../src/historias/tipos.ts";
import { escribirRuta, leerRuta } from "../src/logica/ruta.ts";
import { celda, columnas, esListaDeObjetos, linkCorto } from "../src/logica/tabla.ts";

describe("ruta", () => {
  it("ida y vuelta con un id que lleva barras", () => {
    const ruta = { id: "cliente.GET/reportes/demanda", valores: { consulta: "jobs", vacio: "" } };
    const hash = escribirRuta(ruta);
    expect(hash).toBe("#/cliente.GET/reportes/demanda?consulta=jobs");
    expect(leerRuta(hash)).toEqual({ id: "cliente.GET/reportes/demanda", valores: { consulta: "jobs" } });
  });

  it("valores con =, espacios y acentos", () => {
    const valores = { filtros: "tecnologia=python\nfuente=hn", porque: "pide 5 años de Java" };
    expect(leerRuta(escribirRuta({ id: "jobs.descartar", valores })).valores).toEqual(valores);
  });

  it("hash vacío", () => {
    expect(leerRuta("")).toEqual({ id: "", valores: {} });
  });
});

describe("tabla", () => {
  it("solo una lista no vacía de objetos es tabla", () => {
    expect(esListaDeObjetos([{ a: 1 }])).toBe(true);
    expect(esListaDeObjetos([])).toBe(false);
    expect(esListaDeObjetos([1, 2])).toBe(false);
    expect(esListaDeObjetos([{ a: 1 }, [1]])).toBe(false);
    expect(esListaDeObjetos({ a: 1 })).toBe(false);
  });

  it("columnas en orden de aparición, sin repetir", () => {
    expect(columnas([{ a: 1, b: 2 }, { c: 3, a: 4 }])).toEqual(["a", "b", "c"]);
  });

  it("columnas: lo que nombra la fila primero, los links al final", () => {
    const filas = [{ link: "https://x.dev/1", empresa: "Close", fecha: "2026-10-13", titulo: "Backend" }];
    expect(columnas(filas)).toEqual(["titulo", "empresa", "fecha", "link"]);
  });

  it("columnas: las preferidas de la historia van primero, en su orden; las que no existen se ignoran", () => {
    const filas = [{ link: "https://x.dev/1", empresa: "Close", fecha: "2026-10-13", fuente: "hn", titulo: "Backend" }];
    expect(columnas(filas, ["titulo", "empresa", "fuente", "link", "no-existe"])).toEqual([
      "titulo",
      "empresa",
      "fuente",
      "link",
      "fecha",
    ]);
  });

  it("una fecha ISO se lee como fecha y guarda el original", () => {
    const c = celda("2026-10-13T21:03:57+00:00");
    expect(c.tipo).toBe("fecha");
    if (c.tipo === "fecha") expect(c.iso).toBe("2026-10-13T21:03:57+00:00");
    expect(celda("2026 fue un año").tipo).toBe("texto");
  });

  it("cada valor a su celda", () => {
    expect(celda(undefined)).toEqual({ tipo: "vacia" });
    expect(celda(40)).toEqual({ tipo: "numero", texto: "40" });
    expect(celda("https://news.ycombinator.com/item?id=1")).toEqual({
      tipo: "link",
      href: "https://news.ycombinator.com/item?id=1",
      texto: "news.ycombinator.com/item?id=1",
    });
    expect(celda([{ link: "x", nombre: "MCP" }, { nombre: "React" }])).toEqual({
      tipo: "etiquetas",
      etiquetas: ["MCP", "React"],
    });
    expect(celda(true)).toEqual({ tipo: "texto", texto: "sí" });
  });

  it("un link largo se corta", () => {
    expect(linkCorto(`https://example.com/${"x".repeat(80)}`, 20)).toHaveLength(20);
  });
});

describe("helpers de historias", () => {
  it("pares: clave=valor por línea", () => {
    expect(pares("tecnologia=python\n\nmal\n=sin clave\nurl=a=b")).toEqual({ tecnologia: "python", url: "a=b" });
  });

  it("opcional: vacío es no dado", () => {
    expect(opcional("  ")).toBeUndefined();
    expect(opcional(" hn ")).toBe("hn");
  });
});
