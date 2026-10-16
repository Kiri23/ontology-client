// La leyenda del mapa: una fila por clase con su forma, su color y cuántos nodos tiene. Tocar una la resalta en el
// lienzo; tocarla otra vez la suelta.
import { estiloDe } from "../logica/clases.ts";
import { conteoPorClase, type Modelo } from "../logica/modelo.ts";
import { compacto } from "../logica/prefijos.ts";

interface Props {
  modelo: Modelo;
  /** La clase resaltada (su IRI), o "". */
  activa: string;
  elegir: (clase: string) => void;
}

export function Leyenda({ modelo, activa, elegir }: Props) {
  return (
    <ul className="leyenda" aria-label="Clases del grafo">
      {conteoPorClase(modelo).map(({ clase, n }) => {
        const e = estiloDe(clase);
        return (
          <li key={clase}>
            <button
              type="button"
              aria-pressed={activa === clase}
              title={clase ? compacto(clase) : undefined}
              onClick={() => elegir(activa === clase ? "" : clase)}
            >
              <span className="leyenda-muestra" data-forma={e.forma} data-tono={e.tono} aria-hidden="true" />
              <span className="leyenda-nombre">{e.nombre}</span>
              <span className="leyenda-n">{n}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
