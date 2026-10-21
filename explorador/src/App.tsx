// El explorador: la barra con las clases del SDK, el Grafo y la Ontología, y lo que dice el hash: una historia, una
// vista del Grafo o la Ontología. Las dos vistas se cargan perezosas (import()): el Grafo trae el motor SPARQL en
// WASM, y una historia no tiene por qué pagarlo.
// Un hash sin barra que no es ninguna historia (`#porque`) es el fragmento de un IRI de la ontología
// (https://kiri231.com/ontologia#porque redirige acá): se vuelve #/ontologia?termino=porque.
import doc from "virtual:doc-sdk";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Barra } from "./componentes/Barra.tsx";
import { PanelHistoria } from "./componentes/PanelHistoria.tsx";
import { SiFalla } from "./componentes/SiFalla.tsx";
import { esRutaDeGrafo, leerVista, nombreDeVista } from "./grafo/logica/vistas.ts";
import { buscarHistoria, CLASES, type Historia, HISTORIAS, type Valores } from "./historias/index.ts";
import { useRuta } from "./hooks/useRuta.ts";
import type { Ruta } from "./logica/ruta.ts";
import { esRutaDeOntologia, fragmentoDeIri, PREFIJO_ONTOLOGIA, terminoDe } from "./ontologia/logica/arbol.ts";

const VistaGrafo = lazy(() => import("./grafo/VistaGrafo.tsx"));
const VistaOntologia = lazy(() => import("./ontologia/VistaOntologia.tsx"));

const iniciales = (h: Historia): Valores => Object.fromEntries(h.controles.map((c) => [c.nombre, c.inicial ?? ""]));

interface Props {
  /** La URL base del servidor: el mismo origen que la página (en producción, el de la API). */
  url?: string;
  /** Solo para tests: el fetch que recibe el SDK. */
  fetch?: (pedido: Request) => Promise<Response>;
}

function VistaHistoria({ ruta, navegar, url, fetch }: {
  ruta: Ruta;
  navegar: (ruta: Ruta, como?: "nueva" | "reemplazo") => void;
  url: string;
  fetch?: Props["fetch"];
}) {
  const historia = buscarHistoria(ruta.id) ?? HISTORIAS[0];
  const clase = CLASES.find((c) => c.id === historia.clase)!;
  const valores = useMemo(() => ({ ...iniciales(historia), ...ruta.valores }), [historia, ruta.valores]);
  const cambiar = (nombre: string, valor: string) =>
    navegar({ id: historia.id, valores: { ...ruta.valores, [nombre]: valor } }, "reemplazo");
  return (
    <>
      <title>{`${historia.nombre} · ${historia.clase} · explorador del SDK`}</title>
      {ruta.id && !buscarHistoria(ruta.id) && (
        <p className="aviso">
          No hay una historia <code>{ruta.id}</code>. Abajo, <code>{historia.id}</code>.
        </p>
      )}
      <PanelHistoria
        key={historia.id}
        historia={historia}
        representa={clase.representa}
        doc={doc[historia.funcion]}
        docGenerico={clase.historias.filter((h) => h.funcion === historia.funcion).length > 1}
        valores={valores}
        cambiar={cambiar}
        url={url}
        fetch={fetch}
      />
    </>
  );
}

export function App({ url = globalThis.location.origin, fetch }: Props) {
  const [rutaDelHash, navegar] = useRuta();
  // `#porque`: el fragmento de un IRI. Se lee como la Ontología en ese término y el hash se reescribe limpio.
  const fragmento = buscarHistoria(rutaDelHash.id) || esRutaDeGrafo(rutaDelHash.id) || esRutaDeOntologia(rutaDelHash.id)
    ? ""
    : fragmentoDeIri(rutaDelHash.id);
  const ruta: Ruta = fragmento ? { id: PREFIJO_ONTOLOGIA, valores: { termino: fragmento } } : rutaDelHash;
  useEffect(() => {
    if (fragmento) navegar(ruta, "reemplazo");
  }, [fragmento, ruta, navegar]);
  const enGrafo = esRutaDeGrafo(ruta.id);
  const enOntologia = esRutaDeOntologia(ruta.id);
  // El último nodo indagado, para que la barra vuelva a él después de pasar por otra vista.
  const [indagar, setIndagar] = useState<Valores>();
  useEffect(() => {
    if (ruta.id === "grafo/nodo" && ruta.valores.iri) setIndagar(ruta.valores);
  }, [ruta]);
  const historia = enGrafo || enOntologia ? undefined : buscarHistoria(ruta.id) ?? HISTORIAS[0];
  const actual = historia?.id ?? ruta.id;
  const donde = historia
    ? { seccion: historia.clase, nombre: historia.nombre }
    : enOntologia
    ? { seccion: "Ontología", nombre: terminoDe(ruta) || "Por clase" }
    : { seccion: "Grafo", nombre: nombreDeVista(leerVista(ruta)) };

  return (
    <div className="marco">
      <header className="cabecera">
        <p className="marca">
          <span className="marca-app">explorador</span>
          <span className="marca-paquete">@kiri23/ontology-client</span>
        </p>
        <p className="cabecera-meta">
          <code title="El servidor al que le habla el SDK">{new URL(url).host}</code>
          <a href="https://jsr.io/@kiri23/ontology-client">JSR</a>
          <a href="https://github.com/Kiri23/ontology-client">código</a>
        </p>
      </header>
      <Barra clases={CLASES} actual={actual} donde={donde} indagar={indagar} />
      <main className="principal">
        {enGrafo
          ? (
            // key: cambiar de vista del Grafo limpia un error anterior.
            <SiFalla key={ruta.id}>
              <Suspense fallback={<p className="grafo-cargando" role="status">Abriendo la vista Grafo…</p>}>
                <VistaGrafo ruta={ruta} navegar={navegar} url={url} fetch={fetch} />
              </Suspense>
            </SiFalla>
          )
          : enOntologia
          ? (
            <SiFalla key={ruta.id}>
              <Suspense fallback={<p className="ontologia-aviso" role="status">Abriendo la Ontología…</p>}>
                <VistaOntologia ruta={ruta} navegar={navegar} url={url} fetch={fetch} />
              </Suspense>
            </SiFalla>
          )
          : <VistaHistoria ruta={ruta} navegar={navegar} url={url} fetch={fetch} />}
      </main>
    </div>
  );
}
