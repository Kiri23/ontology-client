// El cuerpo de una vista del Grafo: el lienzo y el panel. En el teléfono, uno debajo del otro (el panel nunca tapa el
// lienzo); en pantalla ancha, lado a lado con el lienzo fijo mientras el panel scrollea.
import type { ReactNode } from "react";

export function Cuerpo({ lienzo, panel }: { lienzo: ReactNode; panel: ReactNode }) {
  return (
    <div className="grafo-cuerpo">
      <div className="grafo-lienzo">{lienzo}</div>
      <div className="grafo-panel">{panel}</div>
    </div>
  );
}

/** Pantalla ancha al montar: decide si un <details> arranca abierto. No sigue al resize (es solo el arranque). */
export const esAncho = () => globalThis.matchMedia?.("(min-width: 72rem)").matches ?? true;
