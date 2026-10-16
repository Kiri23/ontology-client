// "Preguntar con AI" en la consulta libre: Gemma 4 E2B en este dispositivo propone el SPARQL y lo deja en el editor.
// Nunca corre sola: alProponer la pone en el editor y la pasa por el validador; correr es tocar Correr.
// Aparece solo con WebGPU. Antes de bajar nada dice cuánto pesa y espera un Continuar.
import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Grafo } from "../motor.ts";
import { type ClienteAi, type EstadoAi, porcentaje, type Progreso } from "./cliente.ts";
import { consultaPropuesta } from "./extraer.ts";
import { armarMensajes, type Consultar, type Esquema, leerEsquema } from "./prompt.ts";
import { BYTES_DEL_MODELO } from "./protocolo.ts";
import "../../estilos/ai.css";

const gb = (bytes: number) => (bytes / 1e9).toLocaleString("es", { maximumFractionDigits: 1 });

interface Props {
  cliente: ClienteAi;
  grafo: Grafo;
  alProponer: (sparql: string) => void;
}

function Descarga({ progreso }: { progreso?: Progreso }) {
  if (!progreso) {
    return (
      <div className="ai-carga" role="status">
        <p>Empezando la descarga…</p>
        <progress aria-label="Descarga del modelo" />
      </div>
    );
  }
  const pct = porcentaje(progreso);
  return (
    <div className="ai-carga" role="status">
      <p>
        Bajando el modelo: <code>{progreso.archivo.replace(/^onnx\//, "")}</code> · {pct} %
      </p>
      <progress aria-label="Descarga del modelo" value={pct} max={100} />
      <p className="ai-nota">
        {gb(progreso.cargado)} de {gb(Math.max(progreso.total, BYTES_DEL_MODELO))} GB. Queda guardado en el navegador.
      </p>
    </div>
  );
}

function Aviso({ continuar, cancelar }: { continuar: () => void; cancelar: () => void }) {
  return (
    <div className="ai-aviso" role="group" aria-labelledby="ai-aviso-titulo">
      <p className="ai-aviso-titulo" id="ai-aviso-titulo">Antes de bajar el modelo</p>
      <p>
        Gemma 4 E2B corre en este dispositivo, sin servidor ni cuenta.{" "}
        <strong>Baja {gb(BYTES_DEL_MODELO)} GB una sola vez y queda en el navegador</strong>; las próximas veces lo lee
        del disco. Con datos móviles, mejor con Wi-Fi.
      </p>
      <div className="ai-botones">
        <button type="button" className="boton-correr" onClick={continuar}>Continuar</button>
        <button type="button" className="boton-secundario" onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Pregunta({ estado, generar }: { estado: EstadoAi; generar: (pregunta: string) => void }) {
  const [pregunta, setPregunta] = useState("");
  const generando = estado.fase === "generando";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pregunta.trim() && !generando) generar(pregunta);
  };
  return (
    <form className="ai-pregunta" onSubmit={enviar} noValidate>
      <label htmlFor="ai-pregunta">Preguntá en castellano</label>
      <textarea
        id="ai-pregunta"
        rows={2}
        value={pregunta}
        placeholder="¿Qué proyectos usan actions/checkout?"
        onChange={(e) => setPregunta(e.target.value)}
      />
      <div className="ai-botones">
        <button type="submit" className="boton-correr" disabled={generando || !pregunta.trim()}>
          {generando ? "Generando…" : "Generar"}
        </button>
      </div>
      {generando && (
        <pre className="ai-parcial" role="status" aria-label="Lo que va escribiendo la AI">
          {estado.parcial || "Leyendo la pregunta…"}
        </pre>
      )}
      {estado.fase === "listo" && estado.error && (
        <div className="rechazo" role="alert">
          <p className="rechazo-titulo">La AI no pudo generar la consulta</p>
          <p>{estado.error}</p>
          <p className="grafo-pista">Probá de nuevo o con otras palabras. El modelo sigue cargado.</p>
        </div>
      )}
      <p className="ai-nota">
        Lo que proponga va al editor y pasa por el validador. Corre solo si tocás Correr.
      </p>
    </form>
  );
}

export function PreguntarConAi({ cliente, grafo, alProponer }: Props) {
  const estado = useSyncExternalStore(cliente.suscribir, cliente.estado);
  const [avisando, setAvisando] = useState(false);
  // El esquema sale del Store recién al generar: abrir la consulta libre no corre nada en el motor.
  const esquema = useRef<Esquema>(undefined);
  // Al salir de la vista, el worker se termina y una generación en curso se abandona: no vuelve a escribir en una
  // consulta libre que ya no está (ni la reabre por la URL).
  useEffect(() => {
    cliente.revisar();
    return () => cliente.cerrar();
  }, [cliente]);

  const generar = async (pregunta: string) => {
    esquema.current ??= leerEsquema((q) => grafo.store.query(q) as ReturnType<Consultar>);
    try {
      alProponer(consultaPropuesta(await cliente.generar(armarMensajes(esquema.current, pregunta))));
    } catch {
      // El estado ya trae el error (listo con error): se muestra en Pregunta.
    }
  };

  let cuerpo;
  switch (estado.fase) {
    case "revisando":
      return null;
    case "sin-webgpu":
      return (
        <p className="ai-sin-webgpu">
          Preguntar con AI necesita WebGPU, y acá no está ({estado.motivo.replace(/\.$/, "")}). El modelo corre en tu
          dispositivo y sin GPU no entra en memoria. En Chrome de escritorio o de Android aparece el botón.
        </p>
      );
    case "sin-worker":
      return (
        <p className="ai-sin-webgpu" role="alert">
          Preguntar con AI no arrancó: el navegador no cargó su worker (lo pudo bloquear la CSP de la página o la red).
          Detalle: {estado.motivo}
        </p>
      );
    case "disponible":
      cuerpo = avisando
        ? <Aviso continuar={() => (setAvisando(false), cliente.cargar())} cancelar={() => setAvisando(false)} />
        : (
          <>
            {estado.error && (
              <div className="rechazo" role="alert">
                <p className="rechazo-titulo">Se perdió la GPU y el modelo salió de la memoria</p>
                <p>{estado.error}</p>
                <p className="grafo-pista">
                  Tocá Preguntar con AI para cargarlo de nuevo: lo lee del disco, no lo vuelve a bajar.
                </p>
              </div>
            )}
            <button type="button" className="boton-ai" onClick={() => setAvisando(true)}>
              Preguntar con AI
            </button>
          </>
        );
      break;
    case "bajando":
      cuerpo = <Descarga progreso={estado.progreso} />;
      break;
    case "preparando":
      cuerpo = (
        <div className="ai-carga" role="status">
          <p>Preparando el modelo en la GPU. La primera vez tarda un poco más.</p>
          <progress aria-label="Preparando el modelo" />
        </div>
      );
      break;
    case "fallo-carga":
      cuerpo = (
        <div className="rechazo" role="alert">
          <p className="rechazo-titulo">No se pudo cargar el modelo</p>
          <p>{estado.mensaje}</p>
          <p className="grafo-pista">{estado.pista}</p>
          <button type="button" className="boton-secundario" onClick={() => cliente.cargar()}>Probar de nuevo</button>
        </div>
      );
      break;
    default:
      cuerpo = <Pregunta estado={estado} generar={generar} />;
  }
  return <section className="ai" aria-label="Preguntar con AI">{cuerpo}</section>;
}
