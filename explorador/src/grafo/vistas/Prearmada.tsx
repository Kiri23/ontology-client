// Una consulta prearmada: corre en el motor local al abrirse, muestra el resultado como tabla, resalta sus nodos en el
// mapa y deja el SPARQL a la vista.
import { useMemo } from "react";
import { Cuerpo, esAncho } from "../componentes/Cuerpo.tsx";
import { Lienzo } from "../componentes/Lienzo.tsx";
import { Resultado } from "../componentes/Resultado.tsx";
import { Sparql } from "../componentes/Sparql.tsx";
import type { Prearmada as P } from "../logica/consultas.ts";
import { nodosDelResultado } from "../logica/resultados.ts";
import { correr, type Grafo } from "../motor.ts";
import type { Ir } from "../VistaGrafo.tsx";

export function Prearmada({ grafo, consulta, ir }: { grafo: Grafo; consulta: P; ir: Ir }) {
  const { modelo } = grafo;
  const nodos = useMemo(() => [...modelo.nodos.keys()], [modelo]);
  const corrida = useMemo(() => {
    const inicio = performance.now();
    const resultado = correr(grafo, consulta.sparql);
    return { resultado, ms: performance.now() - inicio, resaltados: nodosDelResultado(resultado, modelo) };
  }, [grafo, modelo, consulta]);
  return (
    <Cuerpo
      lienzo={
        <Lienzo
          modelo={modelo}
          nodos={nodos}
          aristas={modelo.aristas}
          resaltados={corrida.resaltados}
          alTocar={(iri) => ir("grafo/nodo", { iri })}
          descripcion={`El grafo entero con los ${corrida.resaltados.size} nodos del resultado resaltados.`}
        />
      }
      panel={
        <>
          <Resultado resultado={corrida.resultado} modelo={modelo} ms={corrida.ms} />
          <Sparql sparql={consulta.sparql} titulo="La consulta" plegado={!esAncho()} />
        </>
      }
    />
  );
}
