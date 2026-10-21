// Las relaciones de un nodo, agrupadas por predicado y dirección, para la ficha del stepper: "ontologia:tieneWorkflow → 2",
// "← ontologia:accion 14". Tocar una agrega esos vecinos al lienzo.
import type { Arista, Modelo } from "./modelo.ts";

export type Direccion = "sale" | "entra";

export interface Relacion {
  predicado: string;
  direccion: Direccion;
  /** Las IRIs del otro extremo, sin repetir. */
  vecinos: string[];
}

/** Las del nodo: primero las que salen, después las que entran; dentro de cada una, las de más vecinos primero. */
export function relacionesDe(m: Modelo, iri: string): Relacion[] {
  const grupos = new Map<string, Relacion>();
  const sumar = (direccion: Direccion, a: Arista, vecino: string) => {
    const clave = `${direccion} ${a.predicado}`;
    let r = grupos.get(clave);
    if (!r) grupos.set(clave, r = { predicado: a.predicado, direccion, vecinos: [] });
    if (!r.vecinos.includes(vecino)) r.vecinos.push(vecino);
  };
  for (const a of m.aristas) {
    if (a.desde === iri) sumar("sale", a, a.hasta);
    if (a.hasta === iri) sumar("entra", a, a.desde);
  }
  return [...grupos.values()].sort((a, b) =>
    (a.direccion === b.direccion ? 0 : a.direccion === "sale" ? -1 : 1) || b.vecinos.length - a.vecinos.length ||
    a.predicado.localeCompare(b.predicado)
  );
}
