// La respuesta de una corrida: el status HTTP (o el ErrorServidor), cuánto tardó, el pedido que hizo el SDK y los
// datos: tabla si es una lista de objetos, JSON siempre.
import { useState } from "react";
import type { Estado, Pedido } from "../hooks/useLlamada.ts";
import { esListaDeObjetos } from "../logica/tabla.ts";
import { Json } from "./Json.tsx";
import { Tabla } from "./Tabla.tsx";

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

function Datos({ datos }: { datos: unknown }) {
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
      {vista === "tabla" ? <Tabla filas={datos} /> : <Json datos={datos} />}
    </>
  );
}

export function Respuesta({ estado, corriendo }: { estado: Estado; corriendo: boolean }) {
  return (
    <section className="recibo" aria-live="polite" aria-busy={corriendo} data-corriendo={corriendo}>
      <h2 className="seccion-titulo">Respuesta</h2>
      {estado.fase === "quieto" && (
        <p className="recibo-vacio">
          {corriendo
            ? "Corriendo…"
            : "Todavía no corrió. Llená los controles y apretá Correr: acá sale el status, el tiempo y lo que devolvió la función."}
        </p>
      )}
      {estado.fase === "ok" && (
        <>
          <Cabecera
            status={estado.pedido?.status}
            ms={estado.ms}
            pedido={estado.pedido}
            extra={Array.isArray(estado.datos) ? `${estado.datos.length} elementos` : undefined}
          />
          <Datos datos={estado.datos} />
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
