// La vista Ontología con un GET /ontologia falso: una sección por clase, el término de la URL resaltado y dicho, y el
// fragmento de un IRI (#porque) vuelto ruta. Más la lógica sin React (logica/arbol.ts).
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { buscarTermino, fragmentoDeIri, local, type Ontologia, resumen } from "../src/ontologia/logica/arbol.ts";
import VistaOntologia from "../src/ontologia/VistaOntologia.tsx";
import { fetchFalso, json } from "./falso.ts";

const URL_BASE = "http://servidor.prueba";
const navegar = () => {};

const ONTOLOGIA: Ontologia = {
  namespace: "https://kiri231.com/ontologia#",
  clases: {
    JobPost: {
      iri: "https://kiri231.com/ontologia#JobPost",
      nombre: "JobPost",
      dominio: "jobs",
      prestada: false,
      comentario: "Un puesto publicado por una fuente.",
      propiedades: {
        porque: {
          iri: "https://kiri231.com/ontologia#porque",
          dominio: "jobs",
          rango: "xsd:string",
          comentario: "Por qué lo descarté.",
        },
        pide: {
          iri: "https://kiri231.com/ontologia#pide",
          dominio: "jobs",
          rango: "Technology",
          comentario: "Menciona esta Technology.",
        },
        empresa: {
          iri: "https://kiri231.com/ontologia#empresa",
          dominio: "jobs",
          rango: null,
          comentario: "Quién publica.",
        },
      },
      shapes: ["JobPostShape"],
      acciones: ["jobs:Descartar"],
    },
    Technology: {
      iri: "https://kiri231.com/ontologia#Technology",
      nombre: "Technology",
      dominio: "tecnologia",
      prestada: false,
      comentario: "",
      propiedades: {},
      shapes: ["TechnologyShape"],
      acciones: [],
    },
    Project: {
      iri: "http://usefulinc.com/ns/doap#Project",
      nombre: "doap:Project",
      dominio: null,
      prestada: true,
      comentario: "",
      propiedades: {
        esPublico: {
          iri: "https://kiri231.com/ontologia#esPublico",
          dominio: "repos",
          rango: "xsd:boolean",
          comentario: "",
        },
      },
      shapes: [],
      acciones: [],
    },
  },
  "sin-clase": {
    propiedades: {
      precondicion: {
        iri: "https://kiri231.com/ontologia#precondicion",
        dominio: "acciones",
        rango: "sh:NodeShape",
        comentario: "",
      },
    },
    shapes: ["l:Demanda", "PuedeDescartar"],
    otros: {
      ClaudeHeadles: {
        iri: "https://kiri231.com/ontologia#ClaudeHeadles",
        dominio: "proyecto",
        tipos: [],
        comentario: "Sin API key.",
      },
    },
  },
};

afterEach(cleanup);

describe("logica/arbol", () => {
  it("buscarTermino dice qué es y de quién", () => {
    expect(buscarTermino(ONTOLOGIA, "porque")).toEqual({
      tipo: "propiedad",
      clase: "JobPost",
    });
    expect(buscarTermino(ONTOLOGIA, "JobPost")).toEqual({
      tipo: "clase",
      clase: "JobPost",
    });
    expect(buscarTermino(ONTOLOGIA, "JobPostShape")).toEqual({
      tipo: "shape",
      clase: "JobPost",
    });
    expect(buscarTermino(ONTOLOGIA, "Descartar")).toEqual({
      tipo: "accion",
      clase: "JobPost",
    });
    expect(buscarTermino(ONTOLOGIA, "precondicion")).toEqual({
      tipo: "propiedad",
      clase: "",
    });
    expect(buscarTermino(ONTOLOGIA, "PuedeDescartar")).toEqual({
      tipo: "shape",
      clase: "",
    });
    expect(buscarTermino(ONTOLOGIA, "ClaudeHeadles")).toEqual({
      tipo: "otro",
      clase: "",
    });
    expect(buscarTermino(ONTOLOGIA, "salario")).toBeUndefined();
    expect(buscarTermino(ONTOLOGIA, "")).toBeUndefined();
  });

  it("local y resumen", () => {
    expect(local("jobs:Descartar")).toBe("Descartar");
    expect(local("JobPostShape")).toBe("JobPostShape");
    expect(resumen(ONTOLOGIA)).toBe(
      "3 clases (1 prestadas), 4 propiedades con dueño.",
    );
  });

  it("un fragmento de IRI es un hash sin barra con forma de nombre, sin el punto de la frase", () => {
    expect(fragmentoDeIri("porque")).toBe("porque");
    expect(fragmentoDeIri("JobPost")).toBe("JobPost");
    expect(fragmentoDeIri("porque.")).toBe("porque");
    expect(fragmentoDeIri("porque),")).toBe("porque");
    expect(fragmentoDeIri("")).toBe("");
    expect(fragmentoDeIri("grafo/mapa")).toBe("");
    expect(fragmentoDeIri("cliente.GET/jobs")).toBe("");
    expect(fragmentoDeIri("jobs.get")).toBe("");
  });
});

describe("VistaOntologia", () => {
  it("una sección por clase, la tabla de propiedades y lo que no tiene clase", async () => {
    const { fetch, vistos } = fetchFalso(() => json(ONTOLOGIA));
    render(
      <VistaOntologia
        ruta={{ id: "ontologia", valores: {} }}
        navegar={navegar}
        url={URL_BASE}
        fetch={fetch}
      />,
    );
    expect(await screen.findByRole("heading", { level: 2, name: /JobPost/ }))
      .toBeTruthy();
    expect(vistos.map((v) => `${v.metodo} ${v.url.pathname}`)).toEqual([
      "GET /ontologia",
    ]);
    expect(
      screen.getByRole("heading", { level: 2, name: /doap:Project/ })
        .textContent,
    ).toContain("clase prestada");
    expect(screen.getByRole("heading", { level: 2, name: /Sin clase dueña/ }))
      .toBeTruthy();
    const fila = screen.getByRole("row", { name: /porque/ });
    expect(fila.textContent).toContain("xsd:string");
    expect(fila.textContent).toContain("Por qué lo descarté.");
    expect(screen.getByRole("row", { name: /empresa/ }).textContent).toContain(
      "sin rango",
    );
    // El rango que es una clase de la página es un link a ella.
    // El índice de arriba tiene otro link "Technology": el del rango se busca dentro de su fila.
    const rango = within(screen.getByRole("row", { name: /pide/ })).getByRole("link", { name: "Technology" });
    expect(rango.getAttribute("href")).toBe("#/ontologia?termino=Technology");
    expect(
      screen.getByText(/3 clases \(1 prestadas\), 4 propiedades con dueño/),
    ).toBeTruthy();
  });

  it("?termino=porque resalta la fila y dice de quién es", async () => {
    const { fetch } = fetchFalso(() => json(ONTOLOGIA));
    render(
      <VistaOntologia
        ruta={{ id: "ontologia", valores: { termino: "porque" } }}
        navegar={navegar}
        url={URL_BASE}
        fetch={fetch}
      />,
    );
    await screen.findByText("porque es una propiedad de JobPost.", { exact: false });
    expect(
      document.getElementById("termino-porque")?.getAttribute("aria-current"),
    ).toBe("true");
    expect(
      document.getElementById("termino-JobPost")?.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("un término que no existe lo dice, y la página sigue entera", async () => {
    const { fetch } = fetchFalso(() => json(ONTOLOGIA));
    render(
      <VistaOntologia
        ruta={{ id: "ontologia", valores: { termino: "salario" } }}
        navegar={navegar}
        url={URL_BASE}
        fetch={fetch}
      />,
    );
    await screen.findByText("No hay ningún término salario", { exact: false });
    expect(screen.getByRole("heading", { level: 2, name: /JobPost/ }))
      .toBeTruthy();
  });

  it("si el servidor falla, lo dice con el status y ofrece reintentar", async () => {
    const { fetch } = fetchFalso(() => json({ error: "se cayó" }, 503));
    render(
      <VistaOntologia
        ruta={{ id: "ontologia", valores: {} }}
        navegar={navegar}
        url={URL_BASE}
        fetch={fetch}
      />,
    );
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("HTTP 503");
    expect(alerta.textContent).toContain("se cayó");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("App", () => {
  it("#/ontologia abre la vista y la barra la nombra", async () => {
    history.replaceState(null, "", "/explorador/#/ontologia");
    const { fetch } = fetchFalso(() => json(ONTOLOGIA));
    render(<App url={URL_BASE} fetch={fetch} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ontología" }))
      .toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Por clase" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    // "ontologia" también es un nombre sin barra: la ruta de la vista no se toma como fragmento de un IRI.
    await screen.findByText("3 clases (1 prestadas)", { exact: false });
    expect(screen.queryByText(/No hay ningún término/)).toBeNull();
    expect(location.hash).toBe("#/ontologia");
  });

  it("#porque (el fragmento de un IRI) es la Ontología en ese término, y el hash queda limpio", async () => {
    history.replaceState(null, "", "/explorador/#porque."); // el punto: pegado desde una frase
    const { fetch } = fetchFalso(() => json(ONTOLOGIA));
    render(<App url={URL_BASE} fetch={fetch} />);
    await screen.findByText("porque es una propiedad de JobPost.", { exact: false });
    expect(location.hash).toBe("#/ontologia?termino=porque");
  });

  it("un hash que sí es una historia no se confunde con un fragmento", () => {
    history.replaceState(null, "", "/explorador/#/jobs.get");
    render(<App url={URL_BASE} fetch={fetchFalso(() => json([])).fetch} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("get");
    expect(location.hash).toBe("#/jobs.get");
  });
});
