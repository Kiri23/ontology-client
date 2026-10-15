// El JSDoc de una función, legible: párrafos, bloques ```ts y `código` en línea. Sin HTML crudo: cada pedazo es un
// elemento de React, así un JSDoc no puede meter marcado en la página.
import type { ReactNode } from "react";

function enLinea(texto: string): ReactNode[] {
  return texto.split(/(`[^`]+`)/g).map((pedazo, i) =>
    pedazo.startsWith("`") && pedazo.endsWith("`") && pedazo.length > 1
      ? <code key={i}>{pedazo.slice(1, -1)}</code>
      : pedazo
  );
}

export function Prosa({ texto }: { texto: string }) {
  if (!texto.trim()) return null;
  const bloques = texto.split(/```\w*\n?([\s\S]*?)```/g);
  return (
    <div className="prosa">
      {bloques.map((bloque, i) =>
        i % 2 === 1 ? <pre key={i} className="prosa-codigo">{bloque.trimEnd()}</pre> : bloque
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((p, j) => <p key={`${i}-${j}`}>{enLinea(p.replace(/\s*\n\s*/g, " ").trim())}</p>)
      )}
    </div>
  );
}
