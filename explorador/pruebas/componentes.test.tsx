// Los hooks y el panel, con el DOM de happy-dom y un fetch falso.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { buscarHistoria } from "../src/historias/index.ts";
import { useLlamada } from "../src/hooks/useLlamada.ts";
import { fetchFalso, JOBS, json } from "./falso.ts";

const URL_BASE = "https://ontology.kiri231.com";

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, "", "/explorador/");
});
afterEach(cleanup);

describe("useLlamada", () => {
  it("ok: los datos, el pedido y el status", async () => {
    const { fetch } = fetchFalso(() => json(JOBS));
    const { result } = renderHook(() => useLlamada(buscarHistoria("jobs.get")!, { url: URL_BASE, fetch }));
    expect(result.current.estado.fase).toBe("quieto");
    act(() => result.current.correr({ tecnologia: "python" }));
    await waitFor(() => expect(result.current.estado.fase).toBe("ok"));
    const estado = result.current.estado;
    if (estado.fase !== "ok") throw new Error("no es ok");
    expect(estado.datos).toEqual(JOBS);
    expect(estado.pedido).toEqual({ metodo: "GET", ruta: "/jobs?tecnologia=python", status: 200 });
    expect(result.current.corriendo).toBe(false);
  });

  it("error: el ErrorServidor con su status", async () => {
    const { fetch } = fetchFalso(() => json({ error: "datos viejos: POST /jobs los rehace" }, 503));
    const { result } = renderHook(() => useLlamada(buscarHistoria("jobs.get")!, { url: URL_BASE, fetch }));
    act(() => result.current.correr({}));
    await waitFor(() => expect(result.current.estado.fase).toBe("error"));
    expect(result.current.estado).toMatchObject({
      fase: "error",
      status: 503,
      nombre: "ErrorServidor",
      mensaje: "GET /jobs: datos viejos: POST /jobs los rehace",
      pedido: { metodo: "GET", ruta: "/jobs", status: 503 },
    });
  });
});

describe("App", () => {
  it("el hash elige la historia; correrla muestra la tabla", async () => {
    history.replaceState(null, "", "/explorador/#/jobs.get?tecnologia=python");
    const { fetch } = fetchFalso(() => json(JOBS));
    render(<App url={URL_BASE} fetch={fetch} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("get");
    expect((screen.getByLabelText(/tecnologia/) as HTMLInputElement).value).toBe("python");
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    await screen.findByRole("table");
    expect(screen.getAllByRole("row")).toHaveLength(JOBS.length + 1);
    expect(screen.getByText("GET /jobs?tecnologia=python")).toBeTruthy();
  });

  it("editar un control lo escribe en el hash", () => {
    history.replaceState(null, "", "/explorador/#/jobs.get");
    render(<App url={URL_BASE} fetch={fetchFalso(() => json([])).fetch} />);
    fireEvent.change(screen.getByLabelText(/fuente/), { target: { value: "hn" } });
    expect(location.hash).toBe("#/jobs.get?fuente=hn");
  });

  it("una acción sin token: Correr deshabilitado y dice por qué", () => {
    history.replaceState(null, "", "/explorador/#/jobs.marcarAplicado?link=https://x");
    const { fetch, vistos } = fetchFalso(() => json(JOBS[0]));
    render(<App url={URL_BASE} fetch={fetch} />);
    const correr = screen.getByRole("button", { name: "Correr" }) as HTMLButtonElement;
    expect(correr.disabled).toBe(true);
    expect(screen.getByText(/Sin token no corre: esta acción escribe en producción/)).toBeTruthy();
    fireEvent.click(correr);
    expect(vistos).toHaveLength(0);
  });

  it("una acción con token pide confirmación; cancelar no escribe, confirmar sí", async () => {
    history.replaceState(null, "", "/explorador/#/jobs.marcarAplicado?link=https://x");
    const { fetch, vistos } = fetchFalso(() => json({ ...JOBS[0], aplicadoEl: "2026-10-15" }));
    render(<App url={URL_BASE} fetch={fetch} />);
    fireEvent.change(screen.getByLabelText(/token de acciones/), { target: { value: "secreto" } });
    expect(sessionStorage.getItem("ontology-explorador.token.acciones")).toBe("secreto");
    expect(location.hash).not.toContain("secreto");

    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    expect(screen.getByRole("alert").textContent).toContain("Esto escribe en producción");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vistos).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, escribir" }));
    await waitFor(() => expect(vistos).toHaveLength(1));
    expect(vistos[0].autorizacion).toBe("Bearer secreto");
    expect(vistos[0].url.pathname).toBe("/jobs/marcar-aplicado");
  });

  it("un error del servidor se muestra con su status y su mensaje", async () => {
    history.replaceState(null, "", "/explorador/#/cliente.GET/preguntar?consulta=nada");
    const { fetch } = fetchFalso(() => json({ error: "no existe consultas/nada.rq" }, 400));
    render(<App url={URL_BASE} fetch={fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    await screen.findByText("no existe consultas/nada.rq");
    expect(screen.getByText("400")).toBeTruthy();
    expect(screen.getByText("ErrorServidor")).toBeTruthy();
  });

  it("la confirmación muestra los valores que se van a mandar", () => {
    const link = "https://news.ycombinator.com/item?id=1";
    history.replaceState(null, "", `/explorador/#/jobs.descartar?link=${encodeURIComponent(link)}&porque=pide+Java`);
    sessionStorage.setItem("ontology-explorador.token.acciones", "secreto");
    const { fetch, vistos } = fetchFalso(() => json(JOBS[0]));
    render(<App url={URL_BASE} fetch={fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toContain(link);
    expect(alerta.textContent).toContain("pide Java");
    expect(alerta.textContent).not.toContain("secreto");
    expect(vistos).toHaveLength(0);
  });

  it("el token no está en el form y les dice a los gestores de contraseñas que no lo guarden", () => {
    history.replaceState(null, "", "/explorador/#/jobs.marcarAplicado");
    render(<App url={URL_BASE} fetch={fetchFalso(() => json([])).fetch} />);
    const token = screen.getByLabelText(/token de acciones/) as HTMLInputElement;
    expect(token.closest("form")).toBeNull();
    expect(token.getAttribute("autocomplete")).toBe("off");
    expect(token.hasAttribute("data-1p-ignore")).toBe(true);
    expect(token.getAttribute("data-lpignore")).toBe("true");
  });

  it("una historia que solo lee pliega el JSDoc genérico y marca el ejemplo que escribe", () => {
    history.replaceState(null, "", "/explorador/#/cliente.GET/reportes/demanda");
    const { container } = render(<App url={URL_BASE} fetch={fetchFalso(() => json([])).fetch} />);
    const plegado = container.querySelector("details.doc-generico") as HTMLDetailsElement;
    expect(plegado).toBeTruthy();
    expect(plegado.open).toBe(false);
    expect(plegado.textContent).toContain("Este ejemplo escribe en el servidor; esta historia solo lee.");
  });

  it("la respuesta en lista trae la tabla y las tarjetas, con las columnas preferidas de la historia primero", async () => {
    history.replaceState(null, "", "/explorador/#/jobs.get");
    const { fetch } = fetchFalso(() => json(JOBS));
    render(<App url={URL_BASE} fetch={fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "Correr" }));
    await screen.findByRole("table");
    const cabeceras = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(cabeceras.slice(0, 5)).toEqual(["#", "titulo", "empresa", "fuente", "link"]);
    expect(screen.getByRole("list", { name: "Respuesta como tarjetas" }).children).toHaveLength(JOBS.length);
  });

  it("la barra trae la sección Grafo con sus vistas, como links del hash", () => {
    history.replaceState(null, "", "/explorador/#/jobs.get");
    render(<App url={URL_BASE} fetch={fetchFalso(() => json([])).fetch} />);
    const barra = screen.getByRole("navigation");
    const links = [...barra.querySelectorAll(".clase-grafo a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links[0]).toEqual(["Mapa", "#/grafo/mapa"]);
    expect(links).toContainEqual(["Huecos", "#/grafo/huecos"]);
    expect(links.at(-1)).toEqual(["Consulta libre", "#/grafo/consulta"]);
  });
});
