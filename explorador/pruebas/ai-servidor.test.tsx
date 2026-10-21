// La vía del servidor (servidor.ts y cliente.ts): qué pide, qué dice cada error, y el flujo entero contra un HTTP de
// verdad que imita POST /ai/sparql de ontologyLearning (vistas/web/ai.py, PR #31): la página en la consulta libre, el
// fetch del navegador (el de happy-dom, al mismo origen) y la consulta validada en el editor.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAi } from "../src/grafo/ai/cliente.ts";
import type { Mensaje } from "../src/grafo/ai/protocolo.ts";
import { explicar, FalloDelServidor, pedirAlServidor, RUTA } from "../src/grafo/ai/servidor.ts";
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

const MENSAJES: Mensaje[] = [{ role: "system", content: "reglas" }, {
  role: "user",
  content: "¿Cuántas acciones hay?",
}];
const json = (estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json", ...cabeceras },
  });
/** Lo que rechaza pedirAlServidor con este fetch. */
const fallo = (buscar: typeof fetch) =>
  pedirAlServidor(MENSAJES, new AbortController().signal, buscar).then(() => "", (e: Error) => e.message);

describe("pedirAlServidor", () => {
  it("manda {mensajes} por POST como JSON a /ai/sparql, en el mismo origen, y devuelve el texto", async () => {
    const buscar = vi.fn((..._: Parameters<typeof fetch>) =>
      Promise.resolve(json(200, { texto: "```sparql\nASK {}\n```" }))
    );
    const senal = new AbortController().signal;
    expect(await pedirAlServidor(MENSAJES, senal, buscar)).toBe("```sparql\nASK {}\n```");
    const [url, init] = buscar.mock.calls[0];
    expect(url).toBe("/ai/sparql");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" }, signal: senal });
    expect(JSON.parse(String(init?.body))).toEqual({ mensajes: MENSAJES });
  });

  it("cada error del servidor, en una frase: el 429 con los segundos de Retry-After", async () => {
    const con = (r: Response) => fallo(() => Promise.resolve(r));
    expect(await con(json(429, { error: "más de 5 pedidos por minuto desde esta IP" }, { "Retry-After": "42" })))
      .toBe("Se llegó al límite de preguntas por minuto: probá de nuevo en 42 s.");
    expect(await con(json(429, { error: "…" }))).toContain("probá de nuevo en 60 s");
    expect(await con(json(502, { error: "Google no contestó en 30 s" })))
      .toBe("Google no contestó en 30 s. Probá de nuevo en un rato.");
    // Un 502 de Cloudflare o kiri-edge (el origen caído o en deploy) trae texto o HTML, no {"error"}: no es Google.
    expect(await con(new Response("error code: 502", { status: 502, headers: { "Content-Type": "text/plain" } })))
      .toBe("El servidor no contestó (502). Probá de nuevo en un rato.");
    expect(await con(new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 })))
      .toBe("El servidor no contestó (502). Probá de nuevo en un rato.");
    expect(await con(json(502, { error: "Google respondió 429 (RESOURCE_EXHAUSTED)" })))
      .toBe("Google respondió 429 (RESOURCE_EXHAUSTED). Probá de nuevo en un rato.");
    // Los 503 de ai.py, con sus textos (ontologyLearning, rama ai-502, vistas/web/ai.py y ai_studio.py en 632cfe0).
    // Con Retry-After (REINTENTAR_EN = 10) la falla es pasajera: se dice cuánto esperar.
    expect(await con(json(503, { error: "Google respondió 500 (INTERNAL)" }, { "Retry-After": "10" })))
      .toBe("Google respondió 500 (INTERNAL). Probá de nuevo en 10 s.");
    expect(await con(json(503, { error: "Google no contestó en 30 s" }, { "Retry-After": "10" })))
      .toBe("Google no contestó en 30 s. Probá de nuevo en 10 s.");
    // Sin Retry-After es de configuración o de cuota: el error solo, sin "Probá de nuevo".
    expect(await con(json(503, { error: "el servidor no tiene key de Google AI Studio: no es una falla de Google" })))
      .toBe("El servidor no tiene key de Google AI Studio: no es una falla de Google.");
    expect(await con(json(503, { error: "Google respondió 429 (RESOURCE_EXHAUSTED)" })))
      .toBe("Google respondió 429 (RESOURCE_EXHAUSTED).");
    // Un 503 sin JSON (no es de ai.py): el mensaje de siempre.
    expect(await con(new Response("Service Unavailable", { status: 503, headers: { "Content-Type": "text/plain" } })))
      .toBe("La AI no está configurada en el servidor todavía: por ahora no se puede preguntar.");
    expect(await con(json(413, { error: "el body pasa de 32768 bytes" }))).toContain("demasiado larga");
    expect(await con(json(400, { error: "la conversación empieza y termina con un mensaje de user" })))
      .toBe("El servidor no aceptó la pregunta: la conversación empieza y termina con un mensaje de user.");
    expect(await con(json(404, { error: "no existe" }))).toContain(
      "todavía no tiene Preguntar con AI (/ai/sparql dio 404)",
    );
    expect(await con(new Response("<html>", { status: 500 }))).toBe(
      "El servidor falló (500). Probá de nuevo en un rato.",
    );
    expect(await con(json(200, { otra: "cosa" }))).toBe("El servidor contestó algo que no es una respuesta de la AI.");
  });

  it("la red caída es un FalloDelServidor; un corte de la señal no, sale tal cual", async () => {
    const red = await pedirAlServidor(
      MENSAJES,
      new AbortController().signal,
      () => Promise.reject(new TypeError("Failed to fetch")),
    ).catch((e) => e);
    expect(red).toBeInstanceOf(FalloDelServidor);
    expect(red.message).toBe("No se pudo hablar con el servidor: revisá la conexión y probá de nuevo.");
    const corte = new AbortController();
    corte.abort();
    const abortado = await pedirAlServidor(
      MENSAJES,
      corte.signal,
      () => Promise.reject(new DOMException("abortado", "AbortError")),
    ).catch((e) => e);
    expect(abortado).not.toBeInstanceOf(FalloDelServidor);
    expect(abortado.name).toBe("AbortError");
  });

  it("explicar no muestra el error del servidor donde no es para quien pregunta", () => {
    expect(explicar(503, undefined, "20")).toBe(
      "La AI no está configurada en el servidor todavía: por ahora no se puede preguntar.",
    );
    expect(explicar(413, "el body pasa de 32768 bytes", null)).not.toContain("body");
    expect(explicar(502, undefined, null)).toBe("El servidor no contestó (502). Probá de nuevo en un rato.");
  });
});

describe("ClienteAi por el servidor", () => {
  const sinGpu = () => new ClienteAi(() => workerFalso().worker, () => false, pedir);
  let pedir: (m: Mensaje[], s: AbortSignal) => Promise<string>;

  it("preguntando → libre con el texto; un error deja la frase, y la próxima pregunta la borra", async () => {
    let fallar = true;
    pedir = vi.fn(() =>
      fallar
        ? Promise.reject(new FalloDelServidor("Se llegó al límite de preguntas por minuto: probá de nuevo en 9 s."))
        : Promise.resolve("ASK {}")
    );
    const cliente = sinGpu();
    const vistos: unknown[] = [];
    cliente.suscribir(() => vistos.push(cliente.servidor()));
    await expect(cliente.preguntarAlServidor(MENSAJES)).rejects.toThrow("9 s");
    expect(cliente.servidor()).toEqual({ fase: "libre", error: expect.stringContaining("en 9 s") });
    fallar = false;
    await expect(cliente.preguntarAlServidor(MENSAJES)).resolves.toBe("ASK {}");
    expect(vistos).toEqual([
      { fase: "preguntando" },
      { fase: "libre", error: expect.any(String) },
      { fase: "preguntando" },
      { fase: "libre" },
    ]);
    expect(pedir).toHaveBeenCalledWith(MENSAJES, expect.any(AbortSignal));
    // El modelo del dispositivo no se toca: sin WebGPU sigue igual.
    expect(cliente.estado().fase).toBe("sin-webgpu");
  });

  it("una segunda pregunta en curso rechaza sin pedir; cerrar() corta la que está y su respuesta no cuenta", async () => {
    let contestar!: (t: string) => void;
    let senal!: AbortSignal;
    pedir = vi.fn((_, s) => (senal = s, new Promise<string>((r) => (contestar = r))));
    const cliente = sinGpu();
    const primera = cliente.preguntarAlServidor(MENSAJES);
    await expect(cliente.preguntarAlServidor(MENSAJES)).rejects.toThrow("en curso");
    expect(pedir).toHaveBeenCalledTimes(1);
    cliente.cerrar();
    expect(senal.aborted).toBe(true);
    expect(cliente.servidor()).toEqual({ fase: "libre" });
    contestar("ASK {}");
    await expect(primera).rejects.toThrow("Se cerró la AI");
    expect(cliente.servidor()).toEqual({ fase: "libre" });
  });

  it("un error que no es del servidor también deja una frase", async () => {
    pedir = () => Promise.reject(new Error("algo raro"));
    const cliente = sinGpu();
    await expect(cliente.preguntarAlServidor(MENSAJES)).rejects.toThrow("algo raro");
    expect(cliente.servidor()).toEqual({ fase: "libre", error: "La AI falló: algo raro" });
  });
});

/**
 * Un /ai/sparql de mentira con lo que valida ai.py: POST, Content-Type JSON, {"mensajes": [...]} que termina en un
 * user. Contesta lo que la prueba ponga en `respuestas`, en orden; el último se repite.
 */
function servidorDeAi() {
  const pedidos: { metodo?: string; tipo?: string; cuerpo: unknown }[] = [];
  const respuestas: { estado: number; cuerpo: unknown; cabeceras?: Record<string, string> }[] = [];
  const leer = (pedido: IncomingMessage) =>
    new Promise<string>((listo) => {
      let texto = "";
      pedido.on("data", (c) => (texto += c)).on("end", () => listo(texto));
    });
  const servidor = createServer(async (pedido, respuesta) => {
    const texto = await leer(pedido);
    if (pedido.url !== RUTA) return void respuesta.writeHead(404).end();
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = texto;
    }
    pedidos.push({ metodo: pedido.method, tipo: pedido.headers["content-type"], cuerpo });
    const mensajes = (cuerpo as { mensajes?: Mensaje[] })?.mensajes;
    const valido = pedido.method === "POST" && pedido.headers["content-type"] === "application/json" &&
      Array.isArray(mensajes) && mensajes.at(-1)?.role === "user";
    const r = valido
      ? (respuestas.length > 1 ? respuestas.shift()! : respuestas[0])
      : { estado: 400, cuerpo: { error: "mensajes no válidos" } };
    respuesta.writeHead(r.estado, { "Content-Type": "application/json", ...r.cabeceras }).end(JSON.stringify(r.cuerpo));
  });
  return { servidor, pedidos, respuestas };
}

describe("de punta a punta contra un /ai/sparql local", () => {
  let grafo: Grafo;
  let local: ReturnType<typeof servidorDeAi>;
  let origen: string;

  beforeAll(async () => {
    grafo = await grafoDePrueba();
    local = servidorDeAi();
    await new Promise<void>((listo) => (local.servidor as Server).listen(0, "127.0.0.1", listo));
    origen = `http://127.0.0.1:${(local.servidor.address() as AddressInfo).port}`;
    // La página, servida desde ese origen: el fetch relativo de servidor.ts va ahí, como en ontology.kiri231.com.
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`${origen}/explorador/`);
  });
  afterAll(() => new Promise<void>((listo) => local.servidor.close(() => listo())));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  // happy-dom escribe en la consola cada pedido que falla (el 429, el connect que no llega): son los esperados.
  const sinConsola = () => {
    for (const k of ["error", "warn", "log"] as const) vi.spyOn(console, k).mockImplementation(() => {});
  };

  const preguntar = (pregunta: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Preguntar con AI" }));
    fireEvent.change(screen.getByLabelText("Preguntá en castellano"), { target: { value: pregunta } });
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  };
  const editor = () => (screen.getByLabelText("SPARQL") as HTMLTextAreaElement).value;
  // Sin WebGPU, como el Pixel: el cliente de verdad, con el fetch de verdad.
  const montar = () =>
    render(
      <ConsultaLibre
        grafo={grafo}
        sparql=""
        ir={vi.fn()}
        ai={new ClienteAi(() => workerFalso().worker, () => false)}
      />,
    );

  it("pregunta → POST /ai/sparql con el prompt → la consulta, con sus PREFIX, validada en el editor", async () => {
    local.respuestas.splice(0, Infinity, {
      estado: 200,
      cuerpo: {
        texto:
          'Acá va:\n```sparql\nSELECT (COUNT(?p) AS ?n) WHERE { ?p a ontologia:JobPost ; dcterms:source "hn" }\n```',
      },
    });
    const antes = local.pedidos.length;
    montar();
    expect(local.pedidos.length).toBe(antes);
    preguntar("¿Cuántos puestos vienen de HN?");
    await vi.waitFor(() => expect(screen.getByText(/el validador la deja correr/)).toBeTruthy(), { timeout: 5000 });
    const pedido = local.pedidos.at(-1)!;
    expect(pedido).toMatchObject({ metodo: "POST", tipo: "application/json" });
    const mensajes = (pedido.cuerpo as { mensajes: Mensaje[] }).mensajes;
    expect(mensajes[0].content).toContain('- dcterms:source: ontologia:JobPost → ?. Valores: "hn", "remotive".');
    expect(mensajes.at(-1)).toEqual({ role: "user", content: "¿Cuántos puestos vienen de HN?" });
    expect(editor()).toBe(
      "PREFIX j: <https://kiri231.com/ontologia#>\nPREFIX dcterms: <http://purl.org/dc/terms/>\n" +
        'SELECT (COUNT(?p) AS ?n) WHERE { ?p a ontologia:JobPost ; dcterms:source "hn" }',
    );
  });

  it("un 429 de verdad, con Retry-After, se lee en la página", async () => {
    local.respuestas.splice(0, Infinity, {
      estado: 429,
      cuerpo: { error: "más de 5 pedidos por minuto desde esta IP" },
      cabeceras: { "Retry-After": "17" },
    });
    sinConsola();
    montar();
    preguntar("¿Qué acciones hay?");
    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toContain("probá de nuevo en 17 s"), {
      timeout: 5000,
    });
  });

  it("con el servidor caído, dice que no hay conexión", async () => {
    const vivo = origen;
    const muerto = createServer();
    await new Promise<void>((listo) => muerto.listen(0, "127.0.0.1", listo));
    const puerto = (muerto.address() as AddressInfo).port;
    await new Promise<void>((listo) => muerto.close(() => listo()));
    const dom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
    dom.setURL(`http://127.0.0.1:${puerto}/explorador/`);
    sinConsola();
    try {
      montar();
      preguntar("¿Qué acciones hay?");
      await vi.waitFor(
        () => expect(screen.getByRole("alert").textContent).toContain("No se pudo hablar con el servidor"),
        {
          timeout: 5000,
        },
      );
    } finally {
      dom.setURL(`${vivo}/explorador/`);
    }
  });
});
