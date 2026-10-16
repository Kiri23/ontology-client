// "Preguntar con AI" en la consulta libre: una AI propone el SPARQL y lo deja en el editor. Nunca corre sola:
// alProponer la pone en el editor y la pasa por el validador; correr es tocar Correr.
// Dos vías (cliente.ts). Por defecto, el servidor (POST /ai/sparql, Gemma 4 en Google AI Studio): anda en cualquier
// navegador, y no le llega nada hasta que se toca Generar. Con WebGPU en modo core se ofrece además Gemma 3 270M en
// este dispositivo; antes de bajar nada dice cuánto pesa y espera un Continuar. En compatibilidad (el Pixel 10) no se
// ofrece: ahí el modelo trabó el teléfono (docs/webgpu-en-el-pixel-10.md).
import { type FormEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Grafo } from "../motor.ts";
import { type ClienteAi, porcentaje, type Progreso } from "./cliente.ts";
import { consultaPropuesta } from "./extraer.ts";
import { armarMensajes, type Consultar, type Esquema, leerEsquema } from "./prompt.ts";
import { bytesDelModelo, type Gpu, type Mensaje, type Variante } from "./protocolo.ts";
import "../../estilos/ai.css";

/** Un tamaño de descarga, en MB como los da Hugging Face: 343 498 783 → "343 MB". El modelo no llega a 1 GB. */
const tamano = (bytes: number) => `${(bytes / 1e6).toLocaleString("es", { maximumFractionDigits: 0 })} MB`;

interface Props {
  cliente: ClienteAi;
  grafo: Grafo;
  alProponer: (sparql: string) => void;
}

/**
 * 268435456 → "256", en MiB: los límites de WebGPU son potencias de 2, y así los dan Chrome y webgpureport. La tabla de
 * embeddings va en la misma unidad, para compararla con el límite.
 */
const mb = (bytes: number) => (bytes / 2 ** 20).toLocaleString("es", { maximumFractionDigits: 0 });

/** Si la tabla de embeddings no entra en un buffer de esta GPU, se avisa debajo del progreso: puede fallar al cargar. */
function NotaDeBinding({ variante }: { variante?: Variante }) {
  if (!variante?.embedExcedeBinding) return null;
  return (
    <p className="ai-nota">
      La tabla de embeddings ({mb(variante.tablaDeEmbed)} MB) supera lo que la GPU acepta por buffer{" "}
      ({mb(variante.maxStorageBufferBindingSize)} MB): puede fallar al cargar; si falla, el error va a decir{" "}
      <code>maxStorageBufferBindingSize</code>.
    </p>
  );
}

function Descarga({ progreso, gpu, variante }: { progreso?: Progreso; gpu: Gpu; variante?: Variante }) {
  if (!progreso) {
    return (
      <div className="ai-carga" role="status">
        <p>Empezando la descarga…</p>
        <progress aria-label="Descarga del modelo" />
        <NotaDeBinding variante={variante} />
      </div>
    );
  }
  // La variante del worker manda; si todavía no llegó, la que dijo el check.
  const esperado = variante?.bytes ?? bytesDelModelo(gpu.f16);
  const pct = porcentaje(progreso, esperado);
  return (
    <div className="ai-carga" role="status">
      <p>
        Bajando el modelo: <code>{progreso.archivo.replace(/^onnx\//, "")}</code> · {pct} %
      </p>
      <progress aria-label="Descarga del modelo" value={pct} max={100} />
      <p className="ai-nota">
        {tamano(progreso.cargado)} de {tamano(Math.max(progreso.total, esperado))}. Queda guardado en el navegador.
      </p>
      <NotaDeBinding variante={variante} />
    </div>
  );
}

function Aviso({ gpu, continuar, cancelar }: { gpu: Gpu; continuar: () => void; cancelar: () => void }) {
  return (
    <div className="ai-aviso" role="group" aria-labelledby="ai-aviso-titulo">
      <p className="ai-aviso-titulo" id="ai-aviso-titulo">Antes de bajar el modelo</p>
      <p>
        Gemma 3 270M corre en este dispositivo, sin servidor ni cuenta.{" "}
        <strong>Baja {tamano(bytesDelModelo(gpu.f16))} una sola vez y queda en el navegador</strong>; las próximas veces
        lo lee del disco. Con datos móviles, mejor con Wi-Fi.
      </p>
      <div className="ai-botones">
        <button type="button" className="boton-correr" onClick={continuar}>Continuar</button>
        <button type="button" className="boton-secundario" onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}

interface PropsPregunta {
  ocupado: boolean;
  /** Lo que se ve mientras está ocupado: lo que va escribiendo el modelo, o que se espera al servidor. */
  progreso: ReactNode;
  /** El último error: por qué no generó y qué hacer. */
  error?: string;
  pista?: string;
  nota: string;
  generar: (pregunta: string) => void;
  /** Abajo de todo: cambiar de vía. */
  children?: ReactNode;
}

function Pregunta({ ocupado, progreso, error, pista, nota, generar, children }: PropsPregunta) {
  const [pregunta, setPregunta] = useState("");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pregunta.trim() && !ocupado) generar(pregunta);
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
        <button type="submit" className="boton-correr" disabled={ocupado || !pregunta.trim()}>
          {ocupado ? "Generando…" : "Generar"}
        </button>
      </div>
      {ocupado && progreso}
      {!ocupado && error && (
        <div className="rechazo" role="alert">
          <p className="rechazo-titulo">La AI no pudo generar la consulta</p>
          <p>{error}</p>
          {pista && <p className="grafo-pista">{pista}</p>}
        </div>
      )}
      <p className="ai-nota">{nota}</p>
      {children}
    </form>
  );
}

const NOTA_SERVIDOR =
  "La pregunta y el esquema del grafo van al servidor de este sitio, que se los pasa a Gemma 4 en " +
  "Google AI Studio (Google puede usar lo que le llega). Lo que proponga va al editor y pasa por el validador. Corre " +
  "solo si tocás Correr.";

const NOTA_DISPOSITIVO =
  "Gemma 3 270M, en este dispositivo: la pregunta no sale de acá. Lo que proponga va al editor y " +
  "pasa por el validador. Corre solo si tocás Correr.";

export function PreguntarConAi({ cliente, grafo, alProponer }: Props) {
  const estado = useSyncExternalStore(cliente.suscribir, cliente.estado);
  const servidor = useSyncExternalStore(cliente.suscribir, cliente.servidor);
  // Lo que es solo de la vista: la pregunta al servidor abierta, y el aviso de tamaño antes de bajar el modelo.
  const [abierta, setAbierta] = useState(false);
  const [avisando, setAvisando] = useState(false);
  // El esquema sale del Store recién al generar: abrir la consulta libre no corre nada en el motor.
  const esquema = useRef<Esquema>(undefined);
  // Al salir de la vista, el worker se termina y lo que esté en curso (en el servidor o en el modelo) se abandona: no
  // vuelve a escribir en una consulta libre que ya no está (ni la reabre por la URL).
  useEffect(() => {
    cliente.revisar();
    return () => cliente.cerrar();
  }, [cliente]);

  const proponer = async (pregunta: string, pedir: (mensajes: Mensaje[]) => Promise<string>) => {
    esquema.current ??= leerEsquema((q) => grafo.store.query(q) as ReturnType<Consultar>);
    try {
      alProponer(consultaPropuesta(await pedir(armarMensajes(esquema.current, pregunta))));
    } catch {
      // El estado ya trae el error: se muestra en Pregunta.
    }
  };

  // El modelo de este dispositivo se ofrece solo con WebGPU core, y mientras no esté en uso.
  const ofrecerDispositivo = estado.fase === "disponible" && estado.gpu.modo === "core";
  const usarDispositivo = ofrecerDispositivo && (
    <button
      type="button"
      className="boton-secundario"
      onClick={() => setAvisando(true)}
    >
      Preguntar en este dispositivo
    </button>
  );

  let cuerpo;
  switch (estado.fase) {
    case "bajando":
      cuerpo = <Descarga progreso={estado.progreso} gpu={estado.gpu} variante={estado.variante} />;
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
          <div className="ai-botones">
            <button type="button" className="boton-secundario" onClick={() => cliente.cargar()}>Probar de nuevo</button>
            <button type="button" className="boton-secundario" onClick={() => (cliente.cerrar(), setAbierta(true))}>
              Usar el servidor
            </button>
          </div>
        </div>
      );
      break;
    case "listo":
    case "generando":
      cuerpo = (
        <Pregunta
          ocupado={estado.fase === "generando"}
          progreso={
            <pre className="ai-parcial" role="status" aria-label="Lo que va escribiendo la AI">
              {estado.fase === "generando" && estado.parcial || "Leyendo la pregunta…"}
            </pre>
          }
          error={estado.fase === "listo" ? estado.error : undefined}
          pista="Probá de nuevo o con otras palabras. El modelo sigue cargado."
          nota={NOTA_DISPOSITIVO}
          generar={(pregunta) => proponer(pregunta, (m) => cliente.generar(m))}
        >
          <div className="ai-botones">
            <button type="button" className="boton-secundario" onClick={() => (cliente.cerrar(), setAbierta(true))}>
              Usar el servidor
            </button>
          </div>
        </Pregunta>
      );
      break;
    default:
      // revisando, sin WebGPU, sin worker o disponible: la vía es el servidor, y no espera al check de WebGPU.
      if (avisando && estado.fase === "disponible") {
        cuerpo = (
          <Aviso
            gpu={estado.gpu}
            continuar={() => (setAvisando(false), cliente.cargar())}
            cancelar={() => setAvisando(false)}
          />
        );
        break;
      }
      cuerpo = (
        <>
          {estado.fase === "disponible" && estado.error && (
            <div className="rechazo" role="alert">
              <p className="rechazo-titulo">Se perdió la GPU y el modelo salió de la memoria</p>
              <p>{estado.error}</p>
              <p className="grafo-pista">
                Tocá Preguntar en este dispositivo para cargarlo de nuevo (lo lee del disco, no lo vuelve a bajar), o
                preguntá al servidor.
              </p>
            </div>
          )}
          {abierta
            ? (
              <Pregunta
                ocupado={servidor.fase === "preguntando"}
                progreso={<p className="ai-nota" role="status">Preguntando a la AI. Tarda unos segundos.</p>}
                error={servidor.fase === "libre" ? servidor.error : undefined}
                nota={NOTA_SERVIDOR}
                generar={(pregunta) => proponer(pregunta, (m) => cliente.preguntarAlServidor(m))}
              >
                {usarDispositivo && <div className="ai-botones">{usarDispositivo}</div>}
              </Pregunta>
            )
            : (
              <div className="ai-botones">
                <button type="button" className="boton-ai" onClick={() => setAbierta(true)}>Preguntar con AI</button>
                {usarDispositivo}
              </div>
            )}
        </>
      );
  }
  return <section className="ai" aria-label="Preguntar con AI">{cuerpo}</section>;
}
