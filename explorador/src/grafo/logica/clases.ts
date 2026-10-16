// Cómo se ve cada clase en el lienzo y en la leyenda: forma de Cytoscape, tono (una variable de estilos/grafo.css) e
// isla. Los Jobs van en azules y los Repos en verde, ocre, oliva y ciruela: las dos islas se leen por color. Ninguna
// usa el rojo, que en el explorador quiere decir "escribe".
import { PREFIJOS } from "./prefijos.ts";

export type Forma = "ellipse" | "diamond" | "round-rectangle" | "hexagon" | "triangle" | "star";

export interface EstiloClase {
  iri: string;
  /** Cómo se nombra en la leyenda. */
  nombre: string;
  forma: Forma;
  /** El sufijo de la variable de color: `--clase-${tono}` en grafo.css. */
  tono: string;
  /** Lado del nodo en px del lienzo. */
  tamano: number;
  /** Si su etiqueta se dibuja en el mapa entero (los JobPost son 131: sin etiqueta hasta que se acerca el zoom). */
  etiqueta: boolean;
  /** Cómo se llama la isla donde esta clase es la más poblada. */
  isla?: string;
}

const JOBS = "los puestos con sus tecnologías";
const REPOS = "los repos con su CI";

export const ESTILOS_CLASE: EstiloClase[] = [
  {
    iri: PREFIJOS.j + "JobPost",
    nombre: "JobPost",
    forma: "ellipse",
    tono: "puesto",
    tamano: 9,
    etiqueta: false,
    isla: JOBS,
  },
  {
    iri: "https://kiri23.dev/tech#Technology",
    nombre: "Technology",
    forma: "diamond",
    tono: "tecnologia",
    tamano: 18,
    etiqueta: true,
    isla: JOBS,
  },
  {
    iri: PREFIJOS.doap + "Project",
    nombre: "doap:Project",
    forma: "round-rectangle",
    tono: "proyecto",
    tamano: 20,
    etiqueta: true,
    isla: REPOS,
  },
  {
    iri: PREFIJOS.k + "Workflow",
    nombre: "Workflow",
    forma: "hexagon",
    tono: "workflow",
    tamano: 13,
    etiqueta: false,
    isla: REPOS,
  },
  { iri: PREFIJOS.k + "Uso", nombre: "Uso", forma: "triangle", tono: "uso", tamano: 9, etiqueta: false, isla: REPOS },
  {
    iri: PREFIJOS.k + "Action",
    nombre: "Action",
    forma: "star",
    tono: "accion",
    tamano: 20,
    etiqueta: true,
    isla: REPOS,
  },
];

const OTRA: Omit<EstiloClase, "iri" | "nombre"> = { forma: "ellipse", tono: "otra", tamano: 10, etiqueta: false };

/** El estilo de una clase; una que no está en la tabla (o "" si el nodo no tiene) sale gris y redonda. */
export function estiloDe(clase: string): EstiloClase {
  return ESTILOS_CLASE.find((e) => e.iri === clase) ??
    { ...OTRA, iri: clase, nombre: clase ? clase.replace(/^.*[#/]/, "") : "sin clase" };
}
