// JSON formateado con color por tipo de token. Lo arma con spans de React (nada de innerHTML); pasado de un tamaño
// va sin color, que miles de spans no ayudan a leer.
import type { ReactNode } from "react";

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const TOPE_COLOR = 150_000;

function colorear(texto: string): ReactNode[] {
  const salida: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(TOKEN)) {
    if (m.index > ultimo) salida.push(texto.slice(ultimo, m.index));
    const clase = m[1] ? (m[2] ? "j-clave" : "j-texto") : m[3] ? "j-literal" : "j-numero";
    salida.push(<span key={m.index} className={clase}>{m[1] ?? m[0]}</span>);
    if (m[2]) salida.push(m[2]);
    ultimo = m.index + m[0].length;
  }
  salida.push(texto.slice(ultimo));
  return salida;
}

export function Json({ datos }: { datos: unknown }) {
  const texto = datos === undefined ? "undefined" : JSON.stringify(datos, null, 2);
  return (
    <pre className="json" tabIndex={0} aria-label="Respuesta como JSON">
      {texto.length > TOPE_COLOR ? texto : colorear(texto)}
    </pre>
  );
}
