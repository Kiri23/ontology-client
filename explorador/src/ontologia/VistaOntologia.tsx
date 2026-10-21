// La vista Ontología: lo que define https://kiri231.com/ontologia#, por clase. Una sección por clase con sus
// propiedades (rango y comentario), su shape y sus acciones, y al final lo que no cuelga de ninguna clase. Cada
// término tiene su id en la página: #/ontologia?termino=porque abre JobPost y resalta la fila de porque. La fuente es
// GET /ontologia (el servidor la saca de domain/*.ttl): no hay lista acá.
import { type ReactNode, useEffect } from "react";
import type { Ruta } from "../logica/ruta.ts";
import { useOntologia } from "./hooks/useOntologia.ts";
import {
  buscarTermino,
  type Clase,
  type Donde,
  local,
  type Ontologia,
  PREFIJO_ONTOLOGIA,
  type Propiedad,
  rangoEsClase,
  resumen,
  terminoDe,
} from "./logica/arbol.ts";
import "../estilos/ontologia.css";

interface Props {
  ruta: Ruta;
  navegar: (ruta: Ruta, como?: "nueva" | "reemplazo") => void;
  url: string;
  fetch?: (pedido: Request) => Promise<Response>;
}

const idDe = (termino: string) => `termino-${termino}`;

function Termino(
  { nombre, foco, children }: {
    nombre: string;
    foco: boolean;
    children?: ReactNode;
  },
) {
  return (
    <code
      id={idDe(nombre)}
      className="ontologia-termino"
      aria-current={foco ? "true" : undefined}
    >
      {children ?? nombre}
    </code>
  );
}

function Rango(
  { o, rango, ir }: {
    o: Ontologia;
    rango: string | null;
    ir: (termino: string) => void;
  },
) {
  if (rango === null) {
    return <span className="ontologia-sin-rango">sin rango</span>;
  }
  if (!rangoEsClase(o, rango)) return <code>{rango}</code>;
  return (
    <a
      href={`#/${PREFIJO_ONTOLOGIA}?termino=${rango}`}
      onClick={(e) => (e.preventDefault(), ir(rango))}
    >
      <code>{rango}</code>
    </a>
  );
}

function Propiedades({ o, propiedades, foco, ir }: {
  o: Ontologia;
  propiedades: Record<string, Propiedad>;
  foco: string;
  ir: (termino: string) => void;
}) {
  const filas = Object.entries(propiedades);
  if (!filas.length) return null;
  return (
    <table className="ontologia-propiedades">
      <thead>
        <tr>
          <th scope="col">propiedad</th>
          <th scope="col">rango</th>
          <th scope="col">qué es</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(([nombre, p]) => (
          <tr key={nombre} data-foco={nombre === foco || undefined}>
            <th scope="row">
              <Termino nombre={nombre} foco={nombre === foco} />
            </th>
            <td>
              <Rango o={o} rango={p.rango} ir={ir} />
            </td>
            <td className="ontologia-comentario">{p.comentario}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cortos(
  { titulo, cortos, foco }: { titulo: string; cortos: string[]; foco: string },
) {
  if (!cortos.length) return null;
  return (
    <p className="ontologia-cortos">
      <span className="ontologia-etiqueta">{titulo}</span>
      {cortos.map((c) => (
        <Termino key={c} nombre={local(c)} foco={local(c) === foco}>
          {c}
        </Termino>
      ))}
    </p>
  );
}

function SeccionClase({ o, nombre, clase, foco, ir }: {
  o: Ontologia;
  nombre: string;
  clase: Clase;
  foco: string;
  ir: (termino: string) => void;
}) {
  return (
    <section
      className="ontologia-clase"
      id={idDe(nombre)}
      aria-current={nombre === foco ? "true" : undefined}
    >
      <h2 className="ontologia-clase-titulo">
        <span>{clase.nombre}</span>
        {clase.dominio && <small className="ontologia-dominio">ontologia.{clase.dominio}</small>}
        {clase.prestada && <small className="ontologia-prestada">clase prestada</small>}
      </h2>
      {clase.comentario && <p className="ontologia-comentario">{clase.comentario}</p>}
      <Propiedades o={o} propiedades={clase.propiedades} foco={foco} ir={ir} />
      <Cortos titulo="shape" cortos={clase.shapes} foco={foco} />
      <Cortos titulo="acciones" cortos={clase.acciones} foco={foco} />
    </section>
  );
}

function SinClase(
  { o, foco, ir }: {
    o: Ontologia;
    foco: string;
    ir: (termino: string) => void;
  },
) {
  const sin = o["sin-clase"];
  const otros = Object.entries(sin.otros);
  if (
    !Object.keys(sin.propiedades).length && !sin.shapes.length && !otros.length
  ) return null;
  return (
    <section
      className="ontologia-clase ontologia-sin-clase"
      id="termino-sin-clase"
    >
      <h2 className="ontologia-clase-titulo">
        <span>Sin clase dueña</span>
        <small>lo que la ontología nombra y no cuelga de ninguna clase</small>
      </h2>
      <Propiedades o={o} propiedades={sin.propiedades} foco={foco} ir={ir} />
      <Cortos titulo="shapes" cortos={sin.shapes} foco={foco} />
      {otros.length > 0 && (
        <dl className="ontologia-otros">
          {otros.map(([nombre, otro]) => (
            <div key={nombre} data-foco={nombre === foco || undefined}>
              <dt>
                <Termino nombre={nombre} foco={nombre === foco} />
                {otro.tipos.length > 0 && <small>{otro.tipos.join(", ")}</small>}
              </dt>
              <dd className="ontologia-comentario">{otro.comentario}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function fraseDe(termino: string, donde: Donde | undefined): string {
  if (!termino) return "";
  if (!donde) return `No hay ningún término ${termino} en la ontología.`;
  const que = {
    clase: "una clase",
    propiedad: "una propiedad",
    shape: "una shape",
    accion: "una acción",
    otro: "un sujeto sin clase",
  }[donde.tipo];
  return donde.clase && donde.tipo !== "clase"
    ? `${termino} es ${que} de ${donde.clase}.`
    : donde.tipo === "clase"
    ? `${termino} es una clase.`
    : `${termino} es ${que}: no cuelga de ninguna clase.`;
}

export default function VistaOntologia({ ruta, navegar, url, fetch }: Props) {
  const termino = terminoDe(ruta);
  const [estado, reintentar] = useOntologia({ url, fetch });
  const ontologia = estado.fase === "lista" ? estado.ontologia : undefined;
  const donde = ontologia ? buscarTermino(ontologia, termino) : undefined;
  const ir = (t: string) => navegar({ id: PREFIJO_ONTOLOGIA, valores: { termino: t } });
  useEffect(() => {
    if (donde) {
      document.getElementById(idDe(termino))?.scrollIntoView({
        block: "center",
      });
    }
  }, [donde, termino]);
  return (
    <article className="ontologia">
      <title>
        {`${termino ? `${termino} · ` : ""}Ontología · explorador del SDK`}
      </title>
      <header className="ontologia-cabecera">
        <h1>Ontología</h1>
        <p className="ontologia-bajada">
          Lo que define{" "}
          <code>
            {ontologia?.namespace ?? "https://kiri231.com/ontologia#"}
          </code>, por clase: cada una con sus propiedades, su shape y sus acciones. {ontologia && resumen(ontologia)}
        </p>
        {termino && ontologia && (
          <p className="ontologia-foco" role="status">
            {fraseDe(termino, donde)}{" "}
            <a
              href={`#/${PREFIJO_ONTOLOGIA}`}
              onClick={(
                e,
              ) => (e.preventDefault(), navegar({ id: PREFIJO_ONTOLOGIA, valores: {} }))}
            >
              Ver todo
            </a>
          </p>
        )}
      </header>
      {estado.fase === "cargando" && (
        <p className="ontologia-aviso" role="status">
          Pidiendo GET /ontologia…
        </p>
      )}
      {estado.fase === "error" && (
        <p className="ontologia-aviso" role="alert">
          No pude leer la ontología{estado.status ? ` (HTTP ${estado.status})` : ""}: {estado.mensaje}{" "}
          <button type="button" className="boton-texto" onClick={reintentar}>
            Reintentar
          </button>
        </p>
      )}
      {ontologia && (
        <>
          <nav className="ontologia-indice" aria-label="Clases">
            {Object.entries(ontologia.clases).map(([nombre, clase]) => (
              <a
                key={nombre}
                href={`#/${PREFIJO_ONTOLOGIA}?termino=${nombre}`}
                onClick={(e) => (e.preventDefault(), ir(nombre))}
                aria-current={nombre === termino ? "true" : undefined}
              >
                {clase.nombre}
              </a>
            ))}
          </nav>
          {Object.entries(ontologia.clases).map(([nombre, clase]) => (
            <SeccionClase
              key={nombre}
              o={ontologia}
              nombre={nombre}
              clase={clase}
              foco={termino}
              ir={ir}
            />
          ))}
          <SinClase o={ontologia} foco={termino} ir={ir} />
        </>
      )}
    </article>
  );
}
