// La ontología como estado de React: cargando, error (con reintentar) o lista. Un solo GET /ontologia por el SDK.
import { useCallback, useEffect, useState } from "react";
import { crearCliente, ErrorServidor } from "../../../../mod.ts";
import type { Ontologia } from "../logica/arbol.ts";

export type EstadoOntologia =
  | { fase: "cargando" }
  | { fase: "error"; mensaje: string; status: number | null }
  | { fase: "lista"; ontologia: Ontologia };

export async function cargarOntologia(
  { url, fetch }: {
    url: string;
    fetch?: (pedido: Request) => Promise<Response>;
  },
): Promise<Ontologia> {
  const { data, error, response } = await crearCliente({ baseUrl: url, fetch })
    .GET("/ontologia");
  if (!response.ok || !data) {
    const mensaje = (error as { error?: unknown } | undefined)?.error;
    throw new ErrorServidor(
      response.status,
      typeof mensaje === "string" ? mensaje : `HTTP ${response.status}`,
    );
  }
  return data;
}

export function useOntologia(
  opciones: { url: string; fetch?: (pedido: Request) => Promise<Response> },
) {
  const [estado, setEstado] = useState<EstadoOntologia>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);
  const { url, fetch } = opciones;
  useEffect(() => {
    let vigente = true;
    setEstado({ fase: "cargando" });
    cargarOntologia({ url, fetch }).then(
      (ontologia) => vigente && setEstado({ fase: "lista", ontologia }),
      (e: unknown) =>
        vigente && setEstado({
          fase: "error",
          mensaje: e instanceof Error ? e.message : String(e),
          status: e instanceof ErrorServidor ? e.status : null,
        }),
    );
    return () => {
      vigente = false;
    };
  }, [url, fetch, intento]);
  const reintentar = useCallback(() => setIntento((i) => i + 1), []);
  return [estado, reintentar] as const;
}
