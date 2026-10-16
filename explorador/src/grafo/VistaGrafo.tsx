// La vista Grafo: el grafo RDF entero en el navegador, con un motor SPARQL local (oxigraph) y el dibujo de Cytoscape.
// Se carga perezosa desde App.tsx (import()): el WASM pesa 1,4 MB comprimido y el resto del explorador no lo paga.
// La URL dice qué vista va (logica/vistas.ts); este componente carga el grafo una vez y elige la vista.
import type { Ruta } from "../logica/ruta.ts";
import type { Valores } from "../historias/index.ts";
import { useGrafo } from "./hooks/useGrafo.ts";
import { leerVista, nombreDeVista, type Vista } from "./logica/vistas.ts";
import type { Grafo } from "./motor.ts";
import { ConsultaLibre } from "./vistas/ConsultaLibre.tsx";
import { frasesDeIslas, Mapa } from "./vistas/Mapa.tsx";
import { Nodo } from "./vistas/Nodo.tsx";
import { Prearmada } from "./vistas/Prearmada.tsx";
import "../estilos/grafo.css";

/** Navegar a otra vista del Grafo: `nueva` agrega una entrada al historial (atrás vuelve), `reemplazo` no. */
export type Ir = (id: string, valores: Valores, como?: "nueva" | "reemplazo") => void;

interface Props {
  ruta: Ruta;
  navegar: (ruta: Ruta, como?: "nueva" | "reemplazo") => void;
  url: string;
  fetch?: (pedido: Request) => Promise<Response>;
}

function bajada(vista: Vista, grafo?: Grafo): string {
  if (vista.tipo === "prearmada") return vista.consulta.pregunta;
  if (vista.tipo === "consulta") {
    return "SELECT, ASK o CONSTRUCT sobre el grafo cargado. El validador la revisa antes de correr.";
  }
  if (vista.tipo === "nodo") {
    return "Tocá una relación para traer sus vecinos al lienzo. Los nodos puestos no se mueven.";
  }
  return grafo ? frasesDeIslas(grafo) : "El grafo entero, cada nodo con el color de su clase.";
}

function VistaElegida({ vista, grafo, ir }: { vista: Vista; grafo: Grafo; ir: Ir }) {
  if (!grafo.modelo.nodos.size) {
    return <p className="grafo-aviso">El grafo está vacío: el servidor no devolvió ninguna tripleta con nodos.</p>;
  }
  switch (vista.tipo) {
    case "prearmada":
      return <Prearmada key={vista.consulta.id} grafo={grafo} consulta={vista.consulta} ir={ir} />;
    case "consulta":
      return <ConsultaLibre grafo={grafo} sparql={vista.sparql} ir={ir} />;
    case "nodo":
      return <Nodo key={vista.iri} grafo={grafo} iri={vista.iri} saltos={vista.saltos} foco={vista.foco} ir={ir} />;
    default:
      return <Mapa grafo={grafo} clase={vista.clase} ir={ir} />;
  }
}

export default function VistaGrafo({ ruta, navegar, url, fetch }: Props) {
  const vista = leerVista(ruta);
  const [estado, reintentar] = useGrafo({ url, fetch });
  const ir: Ir = (id, valores, como = "nueva") => navegar({ id, valores }, como);
  const grafo = estado.fase === "listo" ? estado.grafo : undefined;
  return (
    <article className="grafo" data-vista={vista.tipo}>
      <title>{`${nombreDeVista(vista)} · Grafo · explorador del SDK`}</title>
      <header className="grafo-cabecera">
        <h1>{nombreDeVista(vista)}</h1>
        <p className="grafo-bajada">{bajada(vista, grafo)}</p>
        {vista.tipo === "consulta" && (
          <p className="grafo-costura">Acá va a entrar la AI: lo que proponga pasa por este mismo validador.</p>
        )}
      </header>
      {estado.fase === "cargando" && (
        <p className="grafo-cargando" role="status">
          <progress aria-label="Cargando el grafo" />
          {estado.paso}…
        </p>
      )}
      {estado.fase === "error" && (
        <div className="grafo-error" role="alert">
          <p className="grafo-error-titulo">No se pudo traer el grafo</p>
          <p>{estado.mensaje}</p>
          <p className="grafo-pista">
            {estado.status === null
              ? "No hubo respuesta: revisá la conexión y probá de nuevo."
              : `El servidor respondió ${estado.status}. Si sigue, el endpoint /sparql está caído.`}
          </p>
          <button type="button" className="boton-correr" onClick={reintentar}>Probar de nuevo</button>
        </div>
      )}
      {grafo && <VistaElegida vista={vista} grafo={grafo} ir={ir} />}
    </article>
  );
}
