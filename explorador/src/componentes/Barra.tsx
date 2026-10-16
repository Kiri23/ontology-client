// La barra lateral: las clases del SDK con sus historias, como el árbol de Storybook, y abajo el Grafo con sus vistas.
// En el teléfono se pliega en una sola fila sticky que dice dónde estás; tocarla abre el cajón.
import { type ReactNode, useState } from "react";
import type { Clase } from "../historias/index.ts";
import { ENTRADAS_GRAFO } from "../grafo/logica/vistas.ts";
import { escribirRuta } from "../logica/ruta.ts";
import "../estilos/barra.css";

interface Props {
  clases: Clase[];
  /** El id de la ruta actual: una historia (`jobs.get`) o una vista del Grafo (`grafo/mapa`). */
  actual: string;
  /** Dónde estás, para la barra plegada: la sección y el nombre. */
  donde: { seccion: string; nombre: string };
}

function Entrada({ id, actual, cerrar, children }: {
  id: string;
  actual: string;
  cerrar: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <a href={escribirRuta({ id, valores: {} })} aria-current={id === actual ? "page" : undefined} onClick={cerrar}>
        {children}
      </a>
    </li>
  );
}

export function Barra({ clases, actual, donde }: Props) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);
  return (
    <nav className="barra" data-abierta={abierta} aria-label="Historias del SDK y vistas del grafo">
      <button type="button" className="barra-plegar" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="barra-plegar-seccion">{donde.seccion}</span>
        <span className="barra-plegar-actual">{donde.nombre}</span>
        <span aria-hidden="true" className="barra-plegar-signo" />
        <span className="solo-lector">{abierta ? "Cerrar el índice" : "Abrir el índice"}</span>
      </button>
      <div className="barra-cajon">
        {clases.map((clase) => (
          <section key={clase.id} className="clase">
            <h2 className="clase-titulo">
              <span>{clase.nombre}</span>
              <small>{clase.representa}</small>
            </h2>
            <ul>
              {clase.historias.map((h) => (
                <Entrada key={h.id} id={h.id} actual={actual} cerrar={cerrar}>
                  <span className="historia-nombre">{h.nombre}</span>
                  {h.escribe && <span className="marca-escribe">escribe</span>}
                </Entrada>
              ))}
            </ul>
          </section>
        ))}
        <section className="clase clase-grafo">
          <h2 className="clase-titulo">
            <span>Grafo</span>
            <small>SPARQL local</small>
          </h2>
          <ul>
            {ENTRADAS_GRAFO.map((e) => (
              <Entrada key={e.id} id={e.id} actual={actual} cerrar={cerrar}>
                <span className="historia-nombre">{e.nombre}</span>
              </Entrada>
            ))}
          </ul>
        </section>
      </div>
    </nav>
  );
}
