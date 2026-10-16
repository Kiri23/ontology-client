// La ficha de un nodo en el stepper: qué es (etiqueta, clase, IRI, atributos) y sus relaciones agrupadas por predicado
// en las dos direcciones. Tocar una relación agrega esos vecinos al lienzo: un salto por toque.
import { estiloDe } from "../logica/clases.ts";
import type { Salto } from "../logica/camino.ts";
import type { Modelo } from "../logica/modelo.ts";
import { compacto } from "../logica/prefijos.ts";
import { relacionesDe } from "../logica/relaciones.ts";

interface Props {
  modelo: Modelo;
  iri: string;
  /** Los saltos ya dados: una relación ya agregada se marca y no se repite. */
  saltos: Salto[];
  saltar: (salto: Salto) => void;
}

const esWeb = (iri: string) => /^https?:\/\//.test(iri);

export function Ficha({ modelo, iri, saltos, saltar }: Props) {
  const nodo = modelo.nodos.get(iri);
  if (!nodo) {
    return (
      <p className="grafo-aviso">
        El grafo no tiene un nodo <code>{iri}</code>.
      </p>
    );
  }
  const clase = estiloDe(nodo.clase);
  const relaciones = relacionesDe(modelo, iri);
  return (
    <section className="ficha-nodo" aria-labelledby="ficha-nodo-titulo">
      <p className="ficha-nodo-clase">
        <span className="leyenda-muestra" data-forma={clase.forma} data-tono={clase.tono} aria-hidden="true" />
        {clase.nombre}
      </p>
      <h2 id="ficha-nodo-titulo">{nodo.etiqueta}</h2>
      <p className="ficha-nodo-iri">
        {esWeb(iri) ? <a href={iri} target="_blank" rel="noreferrer">{iri}</a> : <code>{iri}</code>}
      </p>

      <h3>Relaciones</h3>
      {relaciones.length
        ? (
          <ul className="relaciones">
            {relaciones.map((r) => {
              const dado = saltos.some((s) =>
                s.desde === iri && s.predicado === r.predicado && s.direccion === r.direccion
              );
              return (
                <li key={`${r.direccion} ${r.predicado}`}>
                  <button
                    type="button"
                    disabled={dado}
                    onClick={() => saltar({ desde: iri, predicado: r.predicado, direccion: r.direccion })}
                  >
                    <span className="relacion-flecha" aria-label={r.direccion === "sale" ? "sale" : "entra"}>
                      {r.direccion === "sale" ? "→" : "←"}
                    </span>
                    <code className="relacion-predicado">{compacto(r.predicado)}</code>
                    <span className="relacion-n">{dado ? "en el lienzo" : r.vecinos.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
        : <p className="grafo-aviso">No tiene relaciones con otros nodos: es un nodo suelto.</p>}

      {nodo.atributos.length > 0 && (
        <>
          <h3>Atributos</h3>
          <dl className="atributos">
            {nodo.atributos.map((a, i) => (
              <div key={i}>
                <dt>{compacto(a.predicado)}</dt>
                <dd>{a.valor}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
