// El motor SPARQL local: oxigraph (Rust → WASM) con el grafo entero del servidor adentro. Se carga una vez por pestaña
// y lo comparten todas las vistas del Grafo. El grafo llega por el SDK (sparql.consultar), nunca por un fetch a mano.
import init, { Store } from "oxigraph/web.js";
import wasmUrl from "oxigraph/web_bg.wasm?url";
import { sparql } from "../../../mod.ts";
import { armarModelo, type Modelo } from "./logica/modelo.ts";
import { leerResultado, type Resultado, variablesDelSelect } from "./logica/resultados.ts";
import { type Conocidas, CONSULTA_CLASES, CONSULTA_PROPIEDADES } from "./logica/validador.ts";

export interface Grafo {
  store: Store;
  modelo: Modelo;
  conocidas: Conocidas;
}

export interface OpcionesCarga {
  url: string;
  fetch?: (pedido: Request) => Promise<Response>;
}

export const CONSULTA_TODO = "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }";

let cargado: Promise<Grafo> | undefined;

const valores = (store: Store, consulta: string, variable: string) =>
  new Set((store.query(consulta) as Map<string, { value: string }>[]).map((f) => f.get(variable)!.value));

async function cargar({ url, fetch }: OpcionesCarga, avisar: (paso: string) => void): Promise<Grafo> {
  avisar("Bajando el grafo y preparando el motor SPARQL");
  // El wasm sale como asset con hash (?url); la CSP lo deja compilar con 'wasm-unsafe-eval'.
  const [, { texto }] = await Promise.all([
    init({ module_or_path: wasmUrl }),
    sparql.consultar(CONSULTA_TODO, { url, fetch, accept: "text/turtle" }),
  ]);
  avisar("Cargando las tripletas");
  const store = new Store();
  store.load(texto, { format: "text/turtle" });
  return {
    store,
    modelo: armarModelo(store.match(null, null, null, null)),
    conocidas: {
      clases: valores(store, CONSULTA_CLASES, "c"),
      propiedades: valores(store, CONSULTA_PROPIEDADES, "p"),
    },
  };
}

/** El grafo cargado; si la carga falló, el próximo llamado reintenta. */
export function cargarGrafo(opciones: OpcionesCarga, avisar: (paso: string) => void): Promise<Grafo> {
  cargado ??= cargar(opciones, avisar).catch((e) => {
    cargado = undefined;
    throw e;
  });
  return cargado;
}

/** Corre una consulta (ya validada) en el motor local. Tira el error del motor si falla. */
export function correr(grafo: Grafo, consulta: string): Resultado {
  return leerResultado(grafo.store.query(consulta), variablesDelSelect(consulta));
}
