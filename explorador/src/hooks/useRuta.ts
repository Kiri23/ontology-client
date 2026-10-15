// La ruta (historia + valores) como estado externo: el hash es la fuente, React lo lee con useSyncExternalStore.
// Cambiar de historia agrega una entrada al historial (el botón atrás vuelve); editar un control la reemplaza.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { escribirRuta, leerRuta, type Ruta } from "../logica/ruta.ts";

const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  globalThis.addEventListener("hashchange", avisar);
  return () => {
    oyentes.delete(avisar);
    globalThis.removeEventListener("hashchange", avisar);
  };
}

const hashActual = () => globalThis.location.hash;

export function useRuta(): [Ruta, (ruta: Ruta, como?: "nueva" | "reemplazo") => void] {
  const hash = useSyncExternalStore(suscribir, hashActual, () => "");
  const ruta = useMemo(() => leerRuta(hash), [hash]);
  const navegar = useCallback((nueva: Ruta, como: "nueva" | "reemplazo" = "nueva") => {
    const destino = escribirRuta(nueva);
    if (destino === globalThis.location.hash) return;
    // pushState/replaceState no disparan hashchange: se avisa a mano.
    if (como === "nueva") history.pushState(null, "", destino);
    else history.replaceState(null, "", destino);
    for (const avisar of oyentes) avisar();
  }, []);
  return [ruta, navegar];
}
