// Correr una historia: useActionState de React 19 guarda el último resultado y dice si hay una corrida en vuelo.
// El fetch que recibe el SDK (su opción `fetch`, no un envoltorio) anota el método, la ruta y el status del pedido,
// así la respuesta muestra "GET /jobs?tecnologia=python → 200" aunque la función devuelva solo los datos.
import { startTransition, useActionState } from "react";
import { ErrorServidor } from "../../../mod.ts";
import type { Historia, Valores } from "../historias/index.ts";

/** El pedido HTTP que hizo la función. Nunca guarda headers: ahí va el token. */
export interface Pedido {
  metodo: string;
  ruta: string;
  status: number;
}

export type Estado =
  | { fase: "quieto" }
  | { fase: "ok"; datos: unknown; ms: number; pedido?: Pedido }
  | { fase: "error"; status: number | null; nombre: string; mensaje: string; ms: number; pedido?: Pedido };

interface Base {
  url: string;
  token?: string;
  /** El fetch de verdad; los tests pasan uno falso. */
  fetch?: (pedido: Request) => Promise<Response>;
}

function describirError(e: unknown): { status: number | null; nombre: string; mensaje: string } {
  if (e instanceof ErrorServidor) return { status: e.status, nombre: e.name, mensaje: e.message };
  if (e instanceof Error) return { status: null, nombre: e.name, mensaje: e.message };
  return { status: null, nombre: "Error", mensaje: String(e) };
}

export function useLlamada(historia: Historia, base: Base) {
  const [estado, despachar, corriendo] = useActionState(
    async (_anterior: Estado, valores: Valores): Promise<Estado> => {
      const fetchReal = base.fetch ?? ((p: Request) => globalThis.fetch(p));
      let pedido: Pedido | undefined;
      const fetchAnotado = async (p: Request) => {
        const respuesta = await fetchReal(p);
        const url = new URL(p.url);
        pedido = { metodo: p.method, ruta: url.pathname + url.search, status: respuesta.status };
        return respuesta;
      };
      const inicio = performance.now();
      try {
        const datos = await historia.correr(valores, { url: base.url, token: base.token, fetch: fetchAnotado });
        return { fase: "ok", datos, ms: performance.now() - inicio, pedido };
      } catch (e) {
        return { fase: "error", ...describirError(e), ms: performance.now() - inicio, pedido };
      }
    },
    { fase: "quieto" },
  );
  const correr = (valores: Valores) => startTransition(() => despachar(valores));
  return { estado, correr, corriendo };
}
