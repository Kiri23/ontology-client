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

// Un ejemplo que escribe en el servidor: un POST/PUT/PATCH/DELETE del cliente tipado o una de las acciones.
const ESCRIBE = /\.(POST|PUT|PATCH|DELETE)\(|\b(descartar|marcarAplicado)\(/;

function Codigo({ codigo, soloLee }: { codigo: string; soloLee: boolean }) {
  const pre = <pre className="prosa-codigo">{codigo}</pre>;
  if (!soloLee || !ESCRIBE.test(codigo)) return pre;
  return (
    <figure className="prosa-ejemplo">
      <figcaption>Este ejemplo escribe en el servidor; esta historia solo lee.</figcaption>
      {pre}
    </figure>
  );
}

/** `soloLee`: la historia no escribe, así que un ejemplo del JSDoc que sí escribe sale marcado. */
export function Prosa({ texto, soloLee = false }: { texto: string; soloLee?: boolean }) {
  if (!texto.trim()) return null;
  const bloques = texto.split(/```\w*\n?([\s\S]*?)```/g);
  return (
    <div className="prosa">
      {bloques.map((bloque, i) =>
        i % 2 === 1 ? <Codigo key={i} codigo={bloque.trimEnd()} soloLee={soloLee} /> : bloque
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((p, j) => <p key={`${i}-${j}`}>{enLinea(p.replace(/\s*\n\s*/g, " ").trim())}</p>)
      )}
    </div>
  );
}
