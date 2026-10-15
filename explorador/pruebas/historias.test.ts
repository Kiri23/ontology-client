// Cada historia llama al SDK con lo que dicen sus controles. Con un fetch falso: qué pedido sale y qué vuelve.
import { describe, expect, it } from "vitest";
import { ErrorServidor } from "../../mod.ts";
import { buscarHistoria, HISTORIAS } from "../src/historias/index.ts";
import { leerDocSdk } from "../vite/doc-sdk.ts";
import { fetchFalso, JOBS, json } from "./falso.ts";

const URL_BASE = "https://ontology.kiri231.com";

describe("historias", () => {
  it("jobs.get manda los filtros dados y devuelve la lista", async () => {
    const { fetch, vistos } = fetchFalso(() => json(JOBS));
    const datos = await buscarHistoria("jobs.get")!.correr({ tecnologia: "python", fuente: " " }, {
      url: URL_BASE,
      fetch,
    });
    expect(datos).toEqual(JOBS);
    expect(vistos[0].metodo).toBe("GET");
    expect(vistos[0].url.pathname).toBe("/jobs");
    expect(vistos[0].url.search).toBe("?tecnologia=python");
  });

  it("jobs.descartar manda link, porque y el token", async () => {
    const puesto = JOBS[0];
    const { fetch, vistos } = fetchFalso(() => json({ ...puesto, porque: "no" }));
    await buscarHistoria("jobs.descartar")!.correr({ link: ` ${puesto.link} `, porque: "no" }, {
      url: URL_BASE,
      fetch,
      token: "secreto",
    });
    expect(vistos[0].url.pathname).toBe("/jobs/descartar");
    expect(vistos[0].autorizacion).toBe("Bearer secreto");
    expect(JSON.parse(vistos[0].cuerpo)).toEqual({ link: puesto.link, porque: "no" });
  });

  it("validarProyecto no tira: un 401 vuelve como resultado", async () => {
    const { fetch } = fetchFalso(() => json({ error: "falta el token o no es el correcto" }, 401));
    const r = await buscarHistoria("validarProyecto")!.correr({ turtle: "@prefix k: <x#> ." }, {
      url: URL_BASE,
      fetch,
    });
    expect(r).toEqual({ ok: false, status: 401, error: "falta el token o no es el correcto" });
  });

  it("crearCliente GET /preguntar: los filtros van sueltos (form, explode)", async () => {
    const { fetch, vistos } = fetchFalso(() => json([]));
    await buscarHistoria("cliente.GET/preguntar")!.correr(
      { consulta: "jobs", formato: "", filtros: "tecnologia=python" },
      { url: URL_BASE, fetch },
    );
    expect(Object.fromEntries(vistos[0].url.searchParams)).toEqual({ consulta: "jobs", tecnologia: "python" });
  });

  it("crearCliente: un 400 tira ErrorServidor con el mensaje del servidor", async () => {
    const { fetch } = fetchFalso(() => json({ error: "no existe consultas/nada.rq" }, 400));
    const corrida = buscarHistoria("cliente.GET/preguntar")!.correr({ consulta: "nada" }, { url: URL_BASE, fetch });
    await expect(corrida).rejects.toBeInstanceOf(ErrorServidor);
    await expect(corrida).rejects.toMatchObject({ status: 400, message: "no existe consultas/nada.rq" });
  });

  it("ninguna historia de crearCliente hace POST", async () => {
    const { fetch, vistos } = fetchFalso(() => json([]));
    for (const h of HISTORIAS.filter((h) => h.funcion === "crearCliente")) {
      await h.correr({ consulta: "jobs" }, { url: URL_BASE, fetch });
    }
    expect(vistos.map((v) => v.metodo)).toEqual(vistos.map(() => "GET"));
  });
});

describe("doc-sdk", () => {
  const doc = leerDocSdk();

  it("cada historia tiene el JSDoc y la firma de su función", () => {
    for (const h of HISTORIAS) {
      expect(doc[h.funcion]?.descripcion, h.funcion).toBeTruthy();
      expect(doc[h.funcion]?.firma, h.funcion).toMatch(new RegExp(`^${h.funcion.replace(".", "\\.")}\\(`));
    }
  });

  it("lee las funciones de jobs.ts por el export * as jobs, sin clases ni constantes", () => {
    expect(Object.keys(doc).sort()).toEqual([
      "crearCliente",
      "jobs.descartar",
      "jobs.get",
      "jobs.marcarAplicado",
      "validarProyecto",
    ]);
    expect(doc["jobs.get"].archivo).toBe("jobs.ts");
    expect(doc["jobs.get"].descripcion).toContain("Los puestos, lo más nuevo primero");
    expect(doc["jobs.get"].descripcion).toContain("`ErrorServidor`");
  });
});
