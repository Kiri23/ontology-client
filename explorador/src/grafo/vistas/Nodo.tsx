// El stepper: el lienzo arranca con un nodo y cada relación que se toca en la ficha agrega sus vecinos (un salto). Los
// nodos ya puestos no se mueven. Tocar un nodo del lienzo cambia la ficha. El SPARQL del camino se arma solo.
import { useMemo } from "react";
import { Cuerpo } from "../componentes/Cuerpo.tsx";
import { Ficha } from "../componentes/Ficha.tsx";
import { Lienzo } from "../componentes/Lienzo.tsx";
import { Sparql } from "../componentes/Sparql.tsx";
import { escribirSaltos, leerSaltos, type Salto, sparqlDelCamino, subgrafo } from "../logica/camino.ts";
import type { Grafo } from "../motor.ts";
import type { Ir } from "../VistaGrafo.tsx";

interface Props {
  grafo: Grafo;
  iri: string;
  /** Los saltos como van en la URL (camino.ts). */
  saltos: string;
  foco: string;
  ir: Ir;
}

export function Nodo({ grafo, iri, saltos: enUrl, foco: focoUrl, ir }: Props) {
  const { modelo } = grafo;
  const saltos = useMemo(() => leerSaltos(enUrl), [enUrl]);
  const sub = useMemo(() => subgrafo(modelo, iri, saltos), [modelo, iri, saltos]);
  const foco = focoUrl && sub.nodos.includes(focoUrl) ? focoUrl : iri;
  const sparql = useMemo(() => sparqlDelCamino(modelo, iri, saltos), [modelo, iri, saltos]);
  const conSaltos = (lista: Salto[], nuevoFoco = foco) => ({
    iri,
    saltos: escribirSaltos(lista),
    foco: nuevoFoco === iri ? "" : nuevoFoco,
  });

  return (
    <Cuerpo
      lienzo={
        <Lienzo
          modelo={modelo}
          nodos={sub.nodos}
          aristas={sub.aristas}
          foco={foco}
          incremental
          etiquetas="todas"
          alTocar={(n) => ir("grafo/nodo", conSaltos(saltos, n), "reemplazo")}
          descripcion={`El camino desde ${modelo.nodos.get(iri)?.etiqueta ?? iri}: ${sub.nodos.length} nodos.`}
        />
      }
      panel={
        <>
          <Ficha
            modelo={modelo}
            iri={foco}
            saltos={saltos}
            saltar={(s) => ir("grafo/nodo", conSaltos([...saltos, s]))}
          />
          {(saltos.length > 0 || foco !== iri) && (
            <div className="grafo-botones">
              {saltos.length > 0 && (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => ir("grafo/nodo", conSaltos(saltos.slice(0, -1)))}
                >
                  Deshacer el último salto
                </button>
              )}
              {foco !== iri && (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => ir("grafo/nodo", { iri: foco })}
                >
                  Empezar de nuevo desde acá
                </button>
              )}
            </div>
          )}
          {sparql && (
            <Sparql
              sparql={sparql}
              titulo={`El camino en SPARQL${
                saltos.length ? ` (${saltos.length === 1 ? "1 salto" : `${saltos.length} saltos`})` : ""
              }`}
            />
          )}
        </>
      }
    />
  );
}
