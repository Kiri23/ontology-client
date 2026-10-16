// El grafo como estado de React: cargando (con el paso en que va), error (con reintentar) o listo.
import { useCallback, useEffect, useState } from "react";
import { ErrorServidor } from "../../../../mod.ts";
import { cargarGrafo, type Grafo, type OpcionesCarga } from "../motor.ts";

export type EstadoGrafo =
  | { fase: "cargando"; paso: string }
  | { fase: "error"; mensaje: string; status: number | null }
  | { fase: "listo"; grafo: Grafo };

export function useGrafo(opciones: OpcionesCarga): [EstadoGrafo, () => void] {
  const [estado, setEstado] = useState<EstadoGrafo>({
    fase: "cargando",
    paso: "Bajando el grafo y preparando el motor SPARQL",
  });
  const [intento, setIntento] = useState(0);
  const { url, fetch } = opciones;
  useEffect(() => {
    let vigente = true;
    setEstado({ fase: "cargando", paso: "Bajando el grafo y preparando el motor SPARQL" });
    cargarGrafo({ url, fetch }, (paso) => vigente && setEstado({ fase: "cargando", paso })).then(
      (grafo) => vigente && setEstado({ fase: "listo", grafo }),
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
  return [estado, reintentar];
}
