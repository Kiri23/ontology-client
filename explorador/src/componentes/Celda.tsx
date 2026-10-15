// El contenido de una celda ya decidida (logica/tabla.ts): la usan la tabla y las tarjetas.
import type { Celda as Decidida } from "../logica/tabla.ts";

export function Celda({ c }: { c: Decidida }) {
  switch (c.tipo) {
    case "vacia":
      return <span className="celda-vacia">—</span>;
    case "link":
      return <a href={c.href} target="_blank" rel="noreferrer" title={c.href}>{c.texto}</a>;
    case "fecha":
      return <time dateTime={c.iso} title={c.iso}>{c.texto}</time>;
    case "etiquetas":
      return (
        <span className="etiquetas">
          {c.etiquetas.map((e, i) => <span key={i} className="etiqueta">{e}</span>)}
        </span>
      );
    default:
      return <span title={c.texto.length > 60 ? c.texto : undefined}>{c.texto}</span>;
  }
}
