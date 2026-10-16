// El explorador: la barra con las clases del SDK y el Grafo, y lo que dice el hash: una historia o una vista del Grafo.
// La vista Grafo se carga perezosa (import()): trae el motor SPARQL en WASM, y una historia no tiene por qué pagarlo.
import doc from "virtual:doc-sdk";
import { lazy, Suspense, useMemo } from "react";
import { Barra } from "./componentes/Barra.tsx";
import { PanelHistoria } from "./componentes/PanelHistoria.tsx";
import { SiFalla } from "./componentes/SiFalla.tsx";
import { esRutaDeGrafo, leerVista, nombreDeVista } from "./grafo/logica/vistas.ts";
import { buscarHistoria, CLASES, type Historia, HISTORIAS, type Valores } from "./historias/index.ts";
import { useRuta } from "./hooks/useRuta.ts";
import type { Ruta } from "./logica/ruta.ts";

const VistaGrafo = lazy(() => import("./grafo/VistaGrafo.tsx"));

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
  const [ruta, navegar] = useRuta();
  const enGrafo = esRutaDeGrafo(ruta.id);
  const historia = enGrafo ? undefined : buscarHistoria(ruta.id) ?? HISTORIAS[0];
  const actual = historia?.id ?? ruta.id;
  const donde = historia
    ? { seccion: historia.clase, nombre: historia.nombre }
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
      <Barra clases={CLASES} actual={actual} donde={donde} />
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
          : <VistaHistoria ruta={ruta} navegar={navegar} url={url} fetch={fetch} />}
      </main>
    </div>
  );
}
