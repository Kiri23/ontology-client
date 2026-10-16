// La consulta libre: un SPARQL escrito a mano, que pasa por el validador antes de correr en el motor local. SELECT y
// ASK dan una tabla o un sí/no (y los nodos del resultado se resaltan); CONSTRUCT se dibuja en el lienzo. El texto vive
// en la URL (?sparql=), así un link abre la consulta y su resultado.
import { type FormEvent, useMemo, useState } from "react";
import { Copiar } from "../componentes/Copiar.tsx";
import { Cuerpo } from "../componentes/Cuerpo.tsx";
import { Lienzo } from "../componentes/Lienzo.tsx";
import { Resultado } from "../componentes/Resultado.tsx";
import { PREARMADAS } from "../logica/consultas.ts";
import { nodosDelResultado, type Resultado as R, subgrafoDeTriples } from "../logica/resultados.ts";
import { validar } from "../logica/validador.ts";
import { correr, type Grafo } from "../motor.ts";
import type { Ir } from "../VistaGrafo.tsx";

type Corrida =
  | { fase: "rechazada"; motivos: string[] }
  | { fase: "fallo"; mensaje: string }
  | { fase: "ok"; resultado: R; ms: number };

const EJEMPLO = PREARMADAS[0].sparql;

function correrValidada(grafo: Grafo, consulta: string): Corrida {
  const veredicto = validar(consulta, grafo.conocidas);
  if (!veredicto.ok) return { fase: "rechazada", motivos: veredicto.motivos };
  const inicio = performance.now();
  try {
    return { fase: "ok", resultado: correr(grafo, consulta), ms: performance.now() - inicio };
  } catch (e) {
    return { fase: "fallo", mensaje: e instanceof Error ? e.message : String(e) };
  }
}

export function ConsultaLibre({ grafo, sparql, ir }: { grafo: Grafo; sparql: string; ir: Ir }) {
  const { modelo } = grafo;
  const [texto, setTexto] = useState(sparql || EJEMPLO);
  // Un link con ?sparql= abre con el resultado: es local y solo lee, correrla al abrir no cuesta nada.
  const [corrida, setCorrida] = useState<Corrida | undefined>(() => sparql ? correrValidada(grafo, sparql) : undefined);

  const todos = useMemo(() => [...modelo.nodos.keys()], [modelo]);
  const lienzo = useMemo(() => {
    if (corrida?.fase === "ok" && corrida.resultado.tipo === "triples") {
      return { ...subgrafoDeTriples(corrida.resultado.triples), resaltados: undefined, etiquetas: "todas" as const };
    }
    const resaltados = corrida?.fase === "ok" ? nodosDelResultado(corrida.resultado, modelo) : undefined;
    return { nodos: todos, aristas: modelo.aristas, resaltados, etiquetas: "clave" as const };
  }, [corrida, modelo, todos]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setCorrida(correrValidada(grafo, texto));
  };

  return (
    <Cuerpo
      lienzo={
        <Lienzo
          modelo={modelo}
          nodos={lienzo.nodos}
          aristas={lienzo.aristas}
          resaltados={lienzo.resaltados}
          etiquetas={lienzo.etiquetas}
          alTocar={(iri) => modelo.nodos.has(iri) && ir("grafo/nodo", { iri })}
          descripcion={`${lienzo.nodos.length} nodos: ${
            lienzo.etiquetas === "todas" ? "lo que construyó la consulta" : "el grafo entero"
          }.`}
        />
      }
      panel={
        <>
          <form className="consulta" onSubmit={enviar} noValidate>
            <label htmlFor="consulta-sparql" className="consulta-rotulo">SPARQL</label>
            <textarea
              id="consulta-sparql"
              rows={12}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              value={texto}
              aria-invalid={corrida?.fase === "rechazada" || undefined}
              aria-describedby={corrida?.fase === "rechazada" ? "consulta-motivos" : undefined}
              onChange={(e) => {
                setTexto(e.target.value);
                ir("grafo/consulta", { sparql: e.target.value }, "reemplazo");
              }}
            />
            <div className="consulta-pie">
              <button type="submit" className="boton-correr">Correr</button>
              <Copiar texto={texto} />
            </div>
          </form>
          {corrida?.fase === "rechazada" && (
            <div className="rechazo" id="consulta-motivos" role="alert">
              <p className="rechazo-titulo">El validador no la deja correr</p>
              <ul>{corrida.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {corrida?.fase === "fallo" && (
            <div className="rechazo" role="alert">
              <p className="rechazo-titulo">Pasó el validador, pero el motor no la pudo correr</p>
              <p>{corrida.mensaje}</p>
            </div>
          )}
          {corrida?.fase === "ok" && <Resultado resultado={corrida.resultado} modelo={modelo} ms={corrida.ms} />}
        </>
      }
    />
  );
}
