// El explorador: barra con las clases del SDK, y la historia que dice el hash.
import doc from "virtual:doc-sdk";
import { useMemo } from "react";
import { Barra } from "./componentes/Barra.tsx";
import { PanelHistoria } from "./componentes/PanelHistoria.tsx";
import { buscarHistoria, CLASES, type Historia, HISTORIAS, type Valores } from "./historias/index.ts";
import { useRuta } from "./hooks/useRuta.ts";

const iniciales = (h: Historia): Valores =>
  Object.fromEntries(h.controles.map((c) => [c.nombre, c.inicial ?? ""]));

interface Props {
  /** La URL base del servidor: el mismo origen que la página (en producción, el de la API). */
  url?: string;
  /** Solo para tests: el fetch que recibe el SDK. */
  fetch?: (pedido: Request) => Promise<Response>;
}

export function App({ url = globalThis.location.origin, fetch }: Props) {
  const [ruta, navegar] = useRuta();
  const historia = buscarHistoria(ruta.id) ?? HISTORIAS[0];
  const clase = CLASES.find((c) => c.id === historia.clase)!;
  const valores = useMemo(() => ({ ...iniciales(historia), ...ruta.valores }), [historia, ruta.valores]);
  const cambiar = (nombre: string, valor: string) =>
    navegar({ id: historia.id, valores: { ...ruta.valores, [nombre]: valor } }, "reemplazo");

  return (
    <div className="marco">
      <title>{`${historia.nombre} · ${historia.clase} · explorador del SDK`}</title>
      <header className="cabecera">
        <p className="marca">
          <span className="marca-paquete">@kiri23/ontology-client</span>
          <span className="marca-app">explorador</span>
        </p>
        <p className="cabecera-meta">
          contra <code>{new URL(url).host}</code>
          <a href="https://jsr.io/@kiri23/ontology-client">JSR</a>
          <a href="https://github.com/Kiri23/ontology-client">código</a>
        </p>
      </header>
      <Barra clases={CLASES} actual={historia} />
      <main className="principal">
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
          valores={valores}
          cambiar={cambiar}
          url={url}
          fetch={fetch}
        />
      </main>
    </div>
  );
}
