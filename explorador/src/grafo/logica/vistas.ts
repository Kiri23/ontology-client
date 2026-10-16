// Las vistas del Grafo en el hash, sobre logica/ruta.ts (el mismo id + valores de las historias):
//   #/grafo/mapa?clase=k:Action          el grafo entero; `clase` resalta una
//   #/grafo/<prearmada>                  una consulta prearmada (logica/consultas.ts)
//   #/grafo/consulta?sparql=…            la consulta libre
//   #/grafo/nodo?iri=…&saltos=…&foco=…   el stepper: inicio, saltos dados (camino.ts) y el nodo de la ficha
import type { Ruta } from "../../logica/ruta.ts";
import { buscarPrearmada, type Prearmada, PREARMADAS } from "./consultas.ts";

export type Vista =
  | { tipo: "mapa"; clase: string }
  | { tipo: "prearmada"; consulta: Prearmada }
  | { tipo: "consulta"; sparql: string }
  | { tipo: "nodo"; iri: string; saltos: string; foco: string };

export const PREFIJO_GRAFO = "grafo";

export const esRutaDeGrafo = (id: string) => id === PREFIJO_GRAFO || id.startsWith(`${PREFIJO_GRAFO}/`);

/** La vista de un id `grafo/…`; uno que no existe cae al mapa. */
export function leerVista({ id, valores }: Ruta): Vista {
  const nombre = id.slice(PREFIJO_GRAFO.length + 1);
  if (nombre === "consulta") return { tipo: "consulta", sparql: valores.sparql ?? "" };
  if (nombre === "nodo" && valores.iri) {
    return { tipo: "nodo", iri: valores.iri, saltos: valores.saltos ?? "", foco: valores.foco ?? "" };
  }
  const consulta = buscarPrearmada(nombre);
  if (consulta) return { tipo: "prearmada", consulta };
  return { tipo: "mapa", clase: valores.clase ?? "" };
}

/** Las entradas de la barra, en orden. */
export const ENTRADAS_GRAFO: { id: string; nombre: string }[] = [
  { id: `${PREFIJO_GRAFO}/mapa`, nombre: "Mapa" },
  ...PREARMADAS.map((p) => ({ id: `${PREFIJO_GRAFO}/${p.id}`, nombre: p.nombre })),
  { id: `${PREFIJO_GRAFO}/consulta`, nombre: "Consulta libre" },
];

/** El nombre de la vista para la barra plegada y el <title>. */
export function nombreDeVista(v: Vista): string {
  if (v.tipo === "prearmada") return v.consulta.nombre;
  if (v.tipo === "consulta") return "Consulta libre";
  if (v.tipo === "nodo") return "Indagar";
  return "Mapa";
}
