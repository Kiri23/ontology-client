// Un fetch falso para las pruebas: guarda cada pedido y responde lo que diga `responder`. Ninguna prueba toca la red.
import jobs from "../../tests/datos/jobs.json" with { type: "json" };

export const JOBS = jobs;

export interface Visto {
  metodo: string;
  url: URL;
  autorizacion: string | null;
  cuerpo: string;
}

export function fetchFalso(responder: (url: URL, metodo: string) => Response) {
  const vistos: Visto[] = [];
  const fetch = async (pedido: Request) => {
    const url = new URL(pedido.url);
    vistos.push({
      metodo: pedido.method,
      url,
      autorizacion: pedido.headers.get("Authorization"),
      cuerpo: await pedido.clone().text(),
    });
    return responder(url, pedido.method);
  };
  return { fetch, vistos };
}

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
