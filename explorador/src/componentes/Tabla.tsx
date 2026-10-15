// Una lista de objetos como tabla y, en un ancho angosto, como tarjetas (el CSS elige por el ancho del contenedor).
// Muestra las primeras filas: el JSON de al lado tiene todas.
import { useLayoutEffect, useRef, useState } from "react";
import { celda, columnas, type Fila } from "../logica/tabla.ts";
import { Celda } from "./Celda.tsx";
import "../estilos/tabla.css";

const TOPE = 100;
/** Cuántos campos además del título muestra cada tarjeta. */
const CAMPOS_TARJETA = 4;

// true si el contenido es más ancho que la caja: la tabla sigue a la derecha.
function useDesborda<T extends HTMLElement>(dependencia: unknown) {
  const ref = useRef<T>(null);
  const [desborda, setDesborda] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setDesborda(el.scrollWidth > el.clientWidth + 1);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [dependencia]);
  return [ref, desborda] as const;
}

function Tarjetas({ filas, claves }: { filas: Fila[]; claves: string[] }) {
  const [titulo, ...resto] = claves;
  const campos = resto.slice(0, CAMPOS_TARJETA);
  return (
    <ol className="tarjetas" aria-label="Respuesta como tarjetas">
      {filas.map((fila, i) => (
        <li key={i} className="tarjeta">
          <p className="tarjeta-titulo">
            <span className="tarjeta-n">{i + 1}</span> <Celda c={celda(fila[titulo])} />
          </p>
          <dl>
            {campos.map((k) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <Celda c={celda(fila[k])} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

export function Tabla({ filas, preferidas }: { filas: Fila[]; preferidas?: string[] }) {
  const claves = columnas(filas, preferidas);
  const visibles = filas.slice(0, TOPE);
  const [ref, desborda] = useDesborda<HTMLDivElement>(filas);
  const enTarjeta = Math.min(claves.length, CAMPOS_TARJETA + 1);
  return (
    <div className="tabla-marco" data-desborda={desborda}>
      {desborda && (
        <p className="tabla-pista" aria-hidden="true">
          {claves.length} columnas: la tabla sigue a la derecha →
        </p>
      )}
      <div ref={ref} className="tabla-scroll" tabIndex={0} role="region" aria-label="Respuesta como tabla">
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
                      <Celda c={c} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Tarjetas filas={visibles} claves={claves} />
      <p className="tabla-pie">
        {filas.length > TOPE ? `Las primeras ${TOPE} de ${filas.length}. ` : ""}
        {enTarjeta < claves.length && (
          <span className="solo-tarjetas">Cada tarjeta muestra {enTarjeta} de {claves.length} campos.</span>
        )}
        El JSON trae todo.
      </p>
    </div>
  );
}
