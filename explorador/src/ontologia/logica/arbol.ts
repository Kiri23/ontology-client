// La ontología por clase, como la sirve GET /ontologia (el tipo sale del contrato), y lo que la vista necesita saber
// de ella sin React: dónde vive un término y cómo se nombra un rango.
//   #/ontologia                  todas las clases
//   #/ontologia?termino=porque   la misma página, abierta en ese término (una clase, propiedad, shape o acción)
// El fragmento de un IRI (https://kiri231.com/ontologia#porque) llega como `#porque`: App.tsx lo vuelve esta ruta.
import type { paths } from "../../../../generado/api.ts";
import type { Ruta } from "../../logica/ruta.ts";

export type Ontologia = paths["/ontologia"]["get"]["responses"][200]["content"]["application/json"];
export type Clase = Ontologia["clases"][string];
export type Propiedad = Clase["propiedades"][string];

export const PREFIJO_ONTOLOGIA = "ontologia";

export const esRutaDeOntologia = (id: string) => id === PREFIJO_ONTOLOGIA;

/** Un hash sin barra que no es ninguna historia (`#porque`): el fragmento de un IRI de la ontología. */
export const esFragmentoDeIri = (id: string) => id !== "" && !id.includes("/") && /^[A-Za-z]\w*$/.test(id);

export const terminoDe = ({ valores }: Ruta) => valores.termino ?? "";

/** Qué es un término y de qué clase; `clase: ""` es el balde "sin-clase". */
export interface Donde {
  tipo: "clase" | "propiedad" | "shape" | "accion" | "otro";
  clase: string;
}

/** El nombre local de un corto: `jobs:Descartar` → `Descartar`, `JobPostShape` → `JobPostShape`. */
export const local = (corto: string) => corto.slice(corto.indexOf(":") + 1);

/** Dónde vive un término: en qué clase y como qué. Sin clase (`clase: ""`) es del balde "sin-clase". */
export function buscarTermino(
  o: Ontologia,
  termino: string,
): Donde | undefined {
  if (!termino) return undefined;
  for (const [clase, arbol] of Object.entries(o.clases)) {
    if (clase === termino) return { tipo: "clase", clase };
    if (termino in arbol.propiedades) return { tipo: "propiedad", clase };
    if (arbol.shapes.some((s) => local(s) === termino)) {
      return { tipo: "shape", clase };
    }
    if (arbol.acciones.some((a) => local(a) === termino)) {
      return { tipo: "accion", clase };
    }
  }
  const sin = o["sin-clase"];
  if (termino in sin.propiedades) return { tipo: "propiedad", clase: "" };
  if (sin.shapes.some((s) => local(s) === termino)) {
    return { tipo: "shape", clase: "" };
  }
  if (termino in sin.otros) return { tipo: "otro", clase: "" };
  return undefined;
}

/** El rango como link a su clase si es una clase de la página; si no (xsd:string, doap:Project), texto. */
export const rangoEsClase = (o: Ontologia, rango: string | null) => rango !== null && rango in o.clases;

/** Cuántas cosas hay, para la bajada: "10 clases, 19 propiedades". */
export function resumen(o: Ontologia): string {
  const clases = Object.values(o.clases);
  const propiedades = clases.reduce(
    (n, c) => n + Object.keys(c.propiedades).length,
    0,
  );
  const prestadas = clases.filter((c) => c.prestada).length;
  return `${clases.length} clases (${prestadas} prestadas), ${propiedades} propiedades con dueño.`;
}
