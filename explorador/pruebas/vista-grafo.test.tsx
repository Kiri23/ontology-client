// La vista Grafo montada en happy-dom, con Cytoscape falso (happy-dom no tiene canvas) y el motor de verdad (oxigraph
// con pruebas/datos/grafo.ttl). Prueban lo que solo se ve montando: que la consulta libre no corre sin pasar por el
// validador, que un link no la corre solo, y que el <meta> de la CSP existe antes de crear Cytoscape.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import init, { Store } from "oxigraph/web.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Lienzo } from "../src/grafo/componentes/Lienzo.tsx";
import { armarModelo } from "../src/grafo/logica/modelo.ts";
import { CONSULTA_CLASES, CONSULTA_PROPIEDADES } from "../src/grafo/logica/validador.ts";
import type { Grafo } from "../src/grafo/motor.ts";
import { ConsultaLibre } from "../src/grafo/vistas/ConsultaLibre.tsx";

const ID_HOJA = "__________cytoscape_stylesheet";
// Qué elemento tenía el id de la hoja de Cytoscape cuando se creó cada instancia.
const registro = vi.hoisted(() => ({ hojaAlCrear: [] as (string | undefined)[] }));

vi.mock("cytoscape-fcose", () => ({ default: {} }));
vi.mock("cytoscape", () => {
  // Una instancia que acepta cualquier llamada encadenada y no dibuja nada.
  const cadena = (): unknown =>
    new Proxy(function () {}, {
      get: (_, clave) => clave === Symbol.toPrimitive ? () => 0 : clave === "then" ? undefined : cadena(),
      apply: () => cadena(),
    });
  const cytoscape = Object.assign(() => {
    registro.hojaAlCrear.push(document.getElementById("__________cytoscape_stylesheet")?.tagName);
    return cadena();
  }, { use: () => {} });
  return { default: cytoscape };
});

let grafo: Grafo;

beforeAll(async () => {
  await init({ module_or_path: readFileSync(resolve("node_modules/oxigraph/web_bg.wasm")) });
  const store = new Store();
  store.load(readFileSync(resolve("pruebas/datos/grafo.ttl"), "utf8"), { format: "text/turtle" });
  const valores = (q: string, v: string) =>
    new Set((store.query(q) as Map<string, { value: string }>[]).map((f) => f.get(v)!.value));
  grafo = {
    store,
    modelo: armarModelo(store.match(null, null, null, null)),
    conocidas: { clases: valores(CONSULTA_CLASES, "c"), propiedades: valores(CONSULTA_PROPIEDADES, "p") },
  };
});
afterEach(cleanup);

const K = "PREFIX k: <https://kiri231.com/ontologia#>\n";

describe("Lienzo", () => {
  it("ocupa el id de la hoja de Cytoscape con un <meta> antes de crearlo (si no, la CSP bloquea su <style>)", () => {
    document.getElementById(ID_HOJA)?.remove();
    registro.hojaAlCrear.length = 0;
    render(<Lienzo modelo={grafo.modelo} nodos={[]} aristas={[]} descripcion="vacío" />);
    expect(registro.hojaAlCrear).toEqual(["META"]);
  });
});

describe("ConsultaLibre", () => {
  it("un link solo llena el editor; Correr pasa por el validador y muestra el rechazo", () => {
    const sparql = `${K}SELECT ?a WHERE { ?a a ontologia:Accion }`;
    const { container } = render(<ConsultaLibre grafo={grafo} sparql={sparql} ir={vi.fn()} />);
    expect((screen.getByLabelText("SPARQL") as HTMLTextAreaElement).value).toBe(sparql);
    expect(container.querySelector(".rechazo, .resultado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "La clase ontologia:Accion no existe en el grafo; parecida: ontologia:Action.",
    );
    expect(container.querySelector(".resultado")).toBeNull();
  });

  it("un producto cartesiano se rechaza antes de llegar al motor (congelaría la pestaña)", () => {
    const consulta = vi.spyOn(grafo.store, "query");
    render(
      <ConsultaLibre
        grafo={grafo}
        sparql="SELECT (COUNT(*) AS ?n) WHERE { ?a ?b ?c . ?d ?e ?f . ?g ?h ?i }"
        ir={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    expect(screen.getByRole("alert").textContent).toContain("producto cartesiano");
    expect(consulta).not.toHaveBeenCalled();
    consulta.mockRestore();
  });

  it("una consulta válida corre en el motor y da su tabla", () => {
    render(<ConsultaLibre grafo={grafo} sparql={`${K}SELECT ?a WHERE { ?a a ontologia:Action }`} ir={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    expect(screen.getByText(/^10 filas\./)).toBeTruthy();
  });
});
