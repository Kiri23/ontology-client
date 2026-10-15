// Una lista de objetos como tabla. Muestra las primeras filas: el JSON de al lado tiene todas.
import { type Celda, celda, columnas, type Fila } from "../logica/tabla.ts";

const TOPE = 100;

function Contenido({ c }: { c: Celda }) {
  switch (c.tipo) {
    case "vacia":
      return <span className="celda-vacia">—</span>;
    case "link":
      return <a href={c.href} target="_blank" rel="noreferrer" title={c.href}>{c.texto}</a>;
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

export function Tabla({ filas }: { filas: Fila[] }) {
  const claves = columnas(filas);
  const visibles = filas.slice(0, TOPE);
  return (
    <div className="tabla-marco">
      <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Respuesta como tabla">
        <table>
          <thead>
            <tr>
              <th scope="col" className="col-n">#</th>
              {claves.map((k) => <th key={k} scope="col">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila, i) => (
              <tr key={i}>
                <td className="col-n">{i + 1}</td>
                {claves.map((k) => {
                  const c = celda(fila[k]);
                  return (
                    <td key={k} data-tipo={c.tipo}>
                      <Contenido c={c} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > TOPE && (
        <p className="tabla-pie">Las primeras {TOPE} de {filas.length}. El JSON las tiene todas.</p>
      )}
    </div>
  );
}
