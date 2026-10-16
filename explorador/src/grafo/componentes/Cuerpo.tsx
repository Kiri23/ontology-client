// El cuerpo de una vista del Grafo: el lienzo y el panel. En el teléfono, uno debajo del otro (el panel nunca tapa el
// lienzo); en pantalla ancha, lado a lado con el lienzo fijo mientras el panel scrollea.
import type { ReactNode } from "react";

interface Props {
  lienzo: ReactNode;
  panel: ReactNode;
  /** En el teléfono, qué va arriba. La consulta libre pone el editor primero: es lo que se toca. */
  primero?: "lienzo" | "panel";
}

export function Cuerpo({ lienzo, panel, primero = "lienzo" }: Props) {
  return (
    <div className="grafo-cuerpo" data-primero={primero}>
      <div className="grafo-lienzo">{lienzo}</div>
      <div className="grafo-panel">{panel}</div>
    </div>
  );
}

/** Pantalla ancha al montar: decide si un <details> arranca abierto. No sigue al resize (es solo el arranque). */
export const esAncho = () => globalThis.matchMedia?.("(min-width: 72rem)").matches ?? true;
