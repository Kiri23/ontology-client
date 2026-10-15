// Una historia: qué hace (el JSDoc de su función), su firma, los controles, el botón Correr y la respuesta.
// Una historia que escribe no corre sin token y, con token, pide confirmación antes de tocar producción.
// El orden en pantalla lo decide el grid de panel.css: en el teléfono, controles y respuesta antes que la documentación.
import { type FormEvent, useState } from "react";
import type { DocFuncion } from "../../vite/doc-sdk.ts";
import type { Historia, Valores } from "../historias/index.ts";
import { useLlamada } from "../hooks/useLlamada.ts";
import { useToken } from "../hooks/useToken.ts";
import { CampoToken } from "./CampoToken.tsx";
import { Confirmar } from "./Confirmar.tsx";
import { Controles } from "./Controles.tsx";
import { Prosa } from "./Prosa.tsx";
import { Respuesta } from "./Respuesta.tsx";
import "../estilos/panel.css";
import "../estilos/ficha.css";

interface Props {
  historia: Historia;
  representa: string;
  doc?: DocFuncion;
  /** El JSDoc es de una función que corren varias historias (crearCliente): genérico, va plegado. */
  docGenerico?: boolean;
  valores: Valores;
  cambiar: (nombre: string, valor: string) => void;
  /** La URL base del servidor. */
  url: string;
  /** Solo para tests: el fetch que recibe el SDK. */
  fetch?: (pedido: Request) => Promise<Response>;
}

function motivoParaNoCorrer(historia: Historia, token: string, valores: Valores): string | undefined {
  if (historia.token && !token) {
    return historia.escribe
      ? `Sin token no corre: esta acción escribe en producción y el servidor la rechaza sin el token de ${historia.token}. Pegalo arriba.`
      : `Sin token no corre: el servidor responde 401 sin el token de ${historia.token}. Pegalo arriba.`;
  }
  const faltan = historia.controles.filter((c) => c.requerido && !valores[c.nombre]?.trim()).map((c) => c.nombre);
  return faltan.length ? `Falta ${faltan.join(" y ")}.` : undefined;
}

function Documentacion({ historia, doc, generico }: { historia: Historia; doc?: DocFuncion; generico: boolean }) {
  if (!doc) return null;
  const prosa = <Prosa texto={doc.descripcion} soloLee={!historia.escribe} />;
  return (
    <section className="panel-doc" aria-label="Documentación">
      <h2 className="seccion-titulo">Documentación</h2>
      {doc.descripcion && (generico
        ? (
          <details className="doc-generico">
            <summary>
              JSDoc de <code>{historia.funcion}</code>
              <small>Es el de la función entera: sus ejemplos usan otros paths.</small>
            </summary>
            {prosa}
          </details>
        )
        : (
          <>
            <p className="doc-origen">
              JSDoc de <code>{historia.funcion}</code>
            </p>
            {prosa}
          </>
        ))}
      <figure className="firma">
        <figcaption>
          firma · <span>{doc.archivo}</span>
        </figcaption>
        <pre>{doc.firma}</pre>
      </figure>
    </section>
  );
}

export function PanelHistoria(
  { historia, representa, doc, docGenerico = false, valores, cambiar, url, fetch }: Props,
) {
  const [token, guardarToken] = useToken(historia.token);
  const { estado, correr, corriendo } = useLlamada(historia, { url, token: token || undefined, fetch });
  const [confirmando, setConfirmando] = useState(false);
  const motivo = motivoParaNoCorrer(historia, token, valores);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (motivo || corriendo) return;
    if (historia.escribe) setConfirmando(true);
    else correr(valores);
  };

  return (
    <article className="panel">
      <header className="panel-cabecera">
        <p className="miga">
          {historia.clase} <span aria-hidden="true">·</span> {representa}
        </p>
        <h1>{historia.nombre}</h1>
        <p className="insignias">
          {historia.escribe && <span className="insignia insignia-escribe">escribe en producción</span>}
          {historia.token && <span className="insignia">pide token de {historia.token}</span>}
          {!historia.escribe && <span className="insignia">solo lee</span>}
        </p>
        {historia.nota && <p className="nota">{historia.nota}</p>}
      </header>

      <Documentacion historia={historia} doc={doc} generico={docGenerico} />

      <div className="ficha">
        <h2 className="seccion-titulo">Controles</h2>
        <code className="llamada">{historia.llamada}</code>
        {historia.token && <CampoToken tipo={historia.token} valor={token} guardar={guardarToken} />}
        <form onSubmit={enviar} noValidate>
          <Controles idHistoria={historia.id} controles={historia.controles} valores={valores} cambiar={cambiar} />
          <div className="ficha-pie">
            <button
              type="submit"
              className="boton-correr"
              data-escribe={historia.escribe ? "" : undefined}
              disabled={!!motivo || corriendo || confirmando}
              aria-describedby={motivo ? `${historia.id}-motivo` : undefined}
            >
              {corriendo ? "Corriendo…" : "Correr"}
            </button>
            {motivo && <p className="motivo" id={`${historia.id}-motivo`}>{motivo}</p>}
          </div>
        </form>
        {confirmando && (
          <Confirmar
            historia={historia}
            valores={valores}
            host={new URL(url).host}
            confirmar={() => {
              setConfirmando(false);
              correr(valores);
            }}
            cancelar={() => setConfirmando(false)}
          />
        )}
      </div>

      <Respuesta estado={estado} corriendo={corriendo} columnas={historia.columnas} />
    </article>
  );
}
