// Un SPARQL a la vista, con Copiar y Abrir en consulta libre. Lo usan el stepper (el camino acumulado) y las
// consultas prearmadas.
import { escribirRuta } from "../../logica/ruta.ts";
import { Copiar } from "./Copiar.tsx";

interface Props {
  sparql: string;
  titulo: string;
  /** Plegado al empezar (en el teléfono, para no empujar la tabla hacia abajo). */
  plegado?: boolean;
}

export function Sparql({ sparql, titulo, plegado = false }: Props) {
  return (
    <details className="sparql" open={!plegado}>
      <summary>{titulo}</summary>
      <pre tabIndex={0}>{sparql}</pre>
      <div className="sparql-acciones">
        <Copiar texto={sparql} />
        <a className="boton-secundario" href={escribirRuta({ id: "grafo/consulta", valores: { sparql } })}>
          Abrir en consulta libre
        </a>
      </div>
    </details>
  );
}
