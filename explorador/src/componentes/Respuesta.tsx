// La respuesta de una corrida: el status HTTP (o el ErrorServidor), cuánto tardó, el pedido que hizo el SDK y los
// datos: tabla si es una lista de objetos, JSON siempre.
import { useState } from "react";
import type { Estado, Pedido } from "../hooks/useLlamada.ts";
import { esListaDeObjetos } from "../logica/tabla.ts";
import { Json } from "./Json.tsx";
import { Tabla } from "./Tabla.tsx";
import "../estilos/recibo.css";

const tono = (status: number | null | undefined) =>
  status === undefined ? "neutro" : status === null || status >= 400 ? "mal" : "bien";

function Cabecera({ status, ms, pedido, extra }: {
  status: number | null | undefined;
  ms: number;
  pedido?: Pedido;
  extra?: string;
}) {
  return (
    <header className="recibo-cabecera" data-tono={tono(status)}>
      <span className="recibo-status">{status === null ? "sin respuesta" : status ?? "—"}</span>
      <span className="recibo-pedido">
        {pedido ? <code>{pedido.metodo} {pedido.ruta}</code> : <span>sin pedido HTTP</span>}
      </span>
      <span className="recibo-datos">
        {Math.round(ms).toLocaleString("es")} ms{extra ? ` · ${extra}` : ""}
      </span>
    </header>
  );
}

function Datos({ datos, columnas }: { datos: unknown; columnas?: string[] }) {
  const lista = esListaDeObjetos(datos);
  const [vista, setVista] = useState<"tabla" | "json">("tabla");
  if (!lista) return <Json datos={datos} />;
  return (
    <>
      <div className="vistas" role="tablist" aria-label="Cómo ver la respuesta">
        {(["tabla", "json"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
          >
            {v === "tabla" ? "Tabla" : "JSON"}
          </button>
        ))}
      </div>
      {vista === "tabla" ? <Tabla filas={datos} preferidas={columnas} /> : <Json datos={datos} />}
    </>
  );
}

interface Props {
  estado: Estado;
  corriendo: boolean;
  /** Las columnas que la historia pone primero en la tabla. */
  columnas?: string[];
}

export function Respuesta({ estado, corriendo, columnas }: Props) {
  return (
    <section className="recibo" aria-live="polite" aria-busy={corriendo} data-corriendo={corriendo}>
      <h2 className="seccion-titulo">Respuesta</h2>
      {estado.fase === "quieto" && (
        <div className="recibo-vacio">
          <p>
            {corriendo ? "Corriendo…" : "Todavía no corrió. Acá sale el status, el tiempo y lo que devolvió."}
          </p>
        </div>
      )}
      {estado.fase === "ok" && (
        <>
          <Cabecera
            status={estado.pedido?.status}
            ms={estado.ms}
            pedido={estado.pedido}
            extra={Array.isArray(estado.datos) ? `${estado.datos.length} elementos` : undefined}
          />
          <Datos datos={estado.datos} columnas={columnas} />
        </>
      )}
      {estado.fase === "error" && (
        <>
          <Cabecera status={estado.status} ms={estado.ms} pedido={estado.pedido} />
          <div className="recibo-error">
            <p className="recibo-error-nombre">{estado.nombre}</p>
            <p className="recibo-error-mensaje">{estado.mensaje}</p>
          </div>
        </>
      )}
    </section>
  );
}
