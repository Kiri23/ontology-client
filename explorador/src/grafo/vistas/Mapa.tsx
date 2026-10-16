// El mapa: el grafo entero, con la leyenda por clase. Tocar una clase la resalta; tocar un nodo abre su ficha.
import { useMemo } from "react";
import { Cuerpo } from "../componentes/Cuerpo.tsx";
import { Leyenda } from "../componentes/Leyenda.tsx";
import { Lienzo } from "../componentes/Lienzo.tsx";
import { estiloDe } from "../logica/clases.ts";
import { resumenDeIslas } from "../logica/modelo.ts";
import { compacto, expandir } from "../logica/prefijos.ts";
import type { Grafo } from "../motor.ts";
import type { Ir } from "../VistaGrafo.tsx";

const lista = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : xs.join("");

/** "Dos islas que no se tocan: …". Exportada para la cabecera. */
export function frasesDeIslas(grafo: Grafo): string {
  const { grandes, sueltos } = resumenDeIslas(grafo.modelo);
  const islas = grandes.map((i, n) =>
    `${estiloDe(i.clases[0]).isla ?? lista(i.clases.map((c) => estiloDe(c).nombre))} (${i.nodos}${n ? "" : " nodos"})`
  );
  const cuantas = grandes.length === 2 ? "Dos islas" : `${grandes.length} islas`;
  return `${cuantas} que no se tocan: ${lista(islas)}.` +
    (sueltos ? ` Otros ${sueltos} nodos están sueltos, sin ninguna relación.` : "");
}

/** `clase` viene de la URL compacta (`k:Action`). */
export function Mapa({ grafo, clase: enUrl, ir }: { grafo: Grafo; clase: string; ir: Ir }) {
  const { modelo } = grafo;
  const clase = enUrl ? expandir(enUrl) : "";
  const nodos = useMemo(() => [...modelo.nodos.keys()], [modelo]);
  const resaltados = useMemo(
    () => new Set(clase ? nodos.filter((n) => modelo.nodos.get(n)!.clase === clase) : []),
    [modelo, nodos, clase],
  );
  return (
    <Cuerpo
      lienzo={
        <Lienzo
          modelo={modelo}
          nodos={nodos}
          aristas={modelo.aristas}
          resaltados={resaltados}
          alTocar={(iri) => ir("grafo/nodo", { iri })}
          descripcion={`El grafo entero: ${nodos.length} nodos y ${modelo.aristas.length} aristas.`}
        />
      }
      panel={
        <>
          <Leyenda
            modelo={modelo}
            activa={clase}
            elegir={(c) => ir("grafo/mapa", { clase: c ? compacto(c) : "" }, "reemplazo")}
          />
          <p className="grafo-pista">Tocá un nodo para abrir su ficha y seguir sus relaciones.</p>
        </>
      }
    />
  );
}
