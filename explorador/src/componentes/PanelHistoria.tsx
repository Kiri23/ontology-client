// Una historia: qué hace (el JSDoc de su función), su firma, los controles, el botón Correr y la respuesta.
// Una historia que escribe no corre sin token y, con token, pide confirmación antes de tocar producción.
import { type FormEvent, useState } from "react";
import type { DocFuncion } from "../../vite/doc-sdk.ts";
import type { Historia, Valores } from "../historias/index.ts";
import { useLlamada } from "../hooks/useLlamada.ts";
import { useToken } from "../hooks/useToken.ts";
import { CampoToken } from "./CampoToken.tsx";
import { Controles } from "./Controles.tsx";
import { Prosa } from "./Prosa.tsx";
import { Respuesta } from "./Respuesta.tsx";

interface Props {
  historia: Historia;
  representa: string;
  doc?: DocFuncion;
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

export function PanelHistoria({ historia, representa, doc, valores, cambiar, url, fetch }: Props) {
  const [token, guardarToken] = useToken(historia.token);
  const { estado, correr, corriendo } = useLlamada(historia, { url, token: token || undefined, fetch });
  const [confirmando, setConfirmando] = useState(false);
  const motivo = motivoParaNoCorrer(historia, token, valores);
  const host = new URL(url).host;

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
      </header>

      <div className="panel-cuerpo">
        <div className="panel-doc">
          {historia.nota && <p className="nota">{historia.nota}</p>}
          {doc?.descripcion && (
            <>
              <p className="doc-origen">
                JSDoc de <code>{historia.funcion}</code>
              </p>
              <Prosa texto={doc.descripcion} />
            </>
          )}
          {doc && (
            <figure className="firma">
              <figcaption>
                firma · <span>{doc.archivo}</span>
              </figcaption>
              <pre>{doc.firma}</pre>
            </figure>
          )}
        </div>

        <form className="ficha" onSubmit={enviar} noValidate>
          <h2 className="seccion-titulo">Controles</h2>
          <code className="llamada">{historia.llamada}</code>
          {historia.token && <CampoToken tipo={historia.token} valor={token} guardar={guardarToken} />}
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
          {confirmando && (
            <div className="confirmar" role="alert">
              <p className="confirmar-titulo">Esto escribe en producción</p>
              <p>
                <code>{historia.llamada}</code> cambia los datos de <strong>{host}</strong>. No se deshace desde acá.
              </p>
              <div className="confirmar-botones">
                <button
                  type="button"
                  className="boton-peligro"
                  onClick={() => {
                    setConfirmando(false);
                    correr(valores);
                  }}
                >
                  Sí, escribir
                </button>
                <button type="button" className="boton-texto" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      <Respuesta estado={estado} corriendo={corriendo} />
    </article>
  );
}
