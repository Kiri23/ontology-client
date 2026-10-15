// Los tokens se escriben en la página y viven solo en sessionStorage: se van al cerrar la pestaña, no están en el
// bundle, no van en la URL ni en un log. Uno por secret del servidor (acciones, proyectos).
import { useCallback, useSyncExternalStore } from "react";
import type { Token } from "../historias/index.ts";

const clave = (tipo: Token) => `ontology-explorador.token.${tipo}`;
const oyentes = new Set<() => void>();

// sessionStorage puede tirar (modo privado, almacenamiento bloqueado): sin él, el token simplemente no queda.
function leer(tipo: Token): string {
  try {
    return sessionStorage.getItem(clave(tipo)) ?? "";
  } catch {
    return "";
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

export function useToken(tipo: Token | undefined): [string, (valor: string) => void] {
  const valor = useSyncExternalStore(suscribir, () => (tipo ? leer(tipo) : ""), () => "");
  const guardar = useCallback((nuevo: string) => {
    if (!tipo) return;
    try {
      if (nuevo) sessionStorage.setItem(clave(tipo), nuevo);
      else sessionStorage.removeItem(clave(tipo));
    } catch {
      // Sin almacenamiento el token no persiste ni en la pestaña; la página sigue andando.
    }
    for (const avisar of oyentes) avisar();
  }, [tipo]);
  return [valor, guardar];
}
