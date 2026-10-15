// La barra lateral: las clases del SDK y sus historias, como el árbol de Storybook. En el teléfono se pliega y la
// cabecera muestra la historia elegida.
import { useState } from "react";
import type { Clase, Historia } from "../historias/index.ts";
import { escribirRuta } from "../logica/ruta.ts";

interface Props {
  clases: Clase[];
  actual: Historia;
}

export function Barra({ clases, actual }: Props) {
  const [abierta, setAbierta] = useState(false);
  return (
    <nav className="barra" data-abierta={abierta} aria-label="Historias del SDK">
      <button type="button" className="barra-plegar" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="barra-plegar-rotulo">Historia</span>
        <span className="barra-plegar-actual">{actual.clase} / {actual.nombre}</span>
        <span aria-hidden="true" className="barra-plegar-signo">{abierta ? "−" : "+"}</span>
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
                <li key={h.id}>
                  <a
                    href={escribirRuta({ id: h.id, valores: {} })}
                    aria-current={h.id === actual.id ? "page" : undefined}
                    onClick={() => setAbierta(false)}
                  >
                    <span className="historia-nombre">{h.nombre}</span>
                    {h.escribe && <span className="marca-escribe">escribe</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
