// El resultado de una consulta local: tabla para un SELECT (la Tabla del explorador), sí o no para un ASK, y para un
// CONSTRUCT la cuenta de tripletas (el lienzo de al lado las dibuja).
import { Tabla } from "../../componentes/Tabla.tsx";
import type { Modelo } from "../logica/modelo.ts";
import { filasDeTabla, type Resultado as R } from "../logica/resultados.ts";

export function Resultado({ resultado, modelo, ms }: { resultado: R; modelo: Modelo; ms: number }) {
  const tiempo = `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms en el navegador`;
  if (resultado.tipo === "si-no") {
    return (
      <div className="resultado">
        <p className="resultado-cuenta">{tiempo}</p>
        <p className="resultado-si-no">{resultado.valor ? "Sí" : "No"}</p>
      </div>
    );
  }
  if (resultado.tipo === "triples") {
    return (
      <div className="resultado">
        <p className="resultado-cuenta">
          {resultado.triples.length} tripletas, dibujadas en el lienzo. {tiempo}
        </p>
      </div>
    );
  }
  return (
    <div className="resultado">
      <p className="resultado-cuenta">
        {resultado.filas.length === 1 ? "1 fila" : `${resultado.filas.length} filas`}. {tiempo}
      </p>
      {resultado.filas.length
        ? <Tabla filas={filasDeTabla(resultado, modelo)} preferidas={resultado.columnas} sinJson />
        : <p className="grafo-aviso">La consulta corrió pero no encontró nada.</p>}
    </div>
  );
}
