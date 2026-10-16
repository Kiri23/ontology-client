// "Preguntar con AI" en la consulta libre: Gemma 3 270M en este dispositivo propone el SPARQL y lo deja en el editor.
// Nunca corre sola: alProponer la pone en el editor y la pasa por el validador; correr es tocar Correr.
// Aparece solo con WebGPU. Antes de bajar nada dice cuánto pesa y espera un Continuar.
import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Grafo } from "../motor.ts";
import { type ClienteAi, type EstadoAi, porcentaje, type Progreso } from "./cliente.ts";
import { consultaPropuesta } from "./extraer.ts";
import { armarMensajes, type Consultar, type Esquema, leerEsquema } from "./prompt.ts";
import { bytesDelModelo, type Gpu, type Variante } from "./protocolo.ts";
import "../../estilos/ai.css";

/** "El navegador no tiene WebGPU." → "el navegador no tiene WebGPU", para ir entre paréntesis. */
const enMinuscula = (frase: string) => frase.charAt(0).toLowerCase() + frase.slice(1).replace(/\.$/, "");

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
      {gpu.modo === "compatibility" && (
        <p className="ai-nota">
          En este dispositivo el navegador da WebGPU solo en modo compatibilidad. El modelo es el chico para que entre,
          pero así puede andar lento o escribir cualquier cosa.
        </p>
      )}
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
          Preguntar con AI necesita WebGPU, y acá no está ({enMinuscula(estado.motivo)}). El modelo corre en tu
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
        ? (
          <Aviso
            gpu={estado.gpu}
            continuar={() => (setAvisando(false), cliente.cargar())}
            cancelar={() => setAvisando(false)}
          />
        )
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
          <button type="button" className="boton-secundario" onClick={() => cliente.cargar()}>Probar de nuevo</button>
        </div>
      );
      break;
    default:
      cuerpo = <Pregunta estado={estado} generar={generar} />;
  }
  return <section className="ai" aria-label="Preguntar con AI">{cuerpo}</section>;
}
