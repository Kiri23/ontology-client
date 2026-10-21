// Las consultas prearmadas de la vista Grafo. Cada una es una entrada de la barra (#/grafo/<id>) y corre en el motor
// local. Agregar una es agregar un objeto acá: id, nombre, una línea que diga qué responde y el SPARQL. Su prueba va en
// pruebas/grafo.test.ts (corre contra pruebas/datos/grafo.ttl y pasa por el validador).
import { declaraciones } from "./prefijos.ts";

export interface Prearmada {
  /** Va en la URL: #/grafo/acciones-mas-usadas. */
  id: string;
  nombre: string;
  /** Qué pregunta responde, en una línea. */
  pregunta: string;
  sparql: string;
}

const conPrefijos = (cuerpo: string) => declaraciones(cuerpo) + cuerpo;

export const PREARMADAS: Prearmada[] = [
  {
    id: "acciones-mas-usadas",
    nombre: "Acciones más usadas",
    pregunta: "Cuántos pasos de CI (ontologia:Uso) llaman a cada GitHub Action.",
    sparql: conPrefijos(`SELECT ?accion (COUNT(DISTINCT ?uso) AS ?usos) WHERE {
  ?accion a ontologia:Action .
  OPTIONAL { ?uso a ontologia:Uso ; ontologia:accion ?accion . }
}
GROUP BY ?accion
ORDER BY DESC(?usos) ?accion`),
  },
  {
    id: "huecos",
    nombre: "Huecos",
    pregunta: "Proyectos que no usan una acción que usa al menos la mitad de los demás (entre los que tienen CI).",
    // El universo son los doap:Project con algún ontologia:tieneWorkflow: con los 15, entrarían repos ajenos
    // (actions/checkout) y todos serían huecos de todo. Como el proyecto no usa la acción, ?usan ya cuenta solo a otros.
    sparql: conPrefijos(`SELECT ?proyecto ?accion ?usan ?otros WHERE {
  { SELECT (COUNT(DISTINCT ?x) AS ?total) WHERE { ?x a doap:Project ; ontologia:tieneWorkflow ?w . } }
  { SELECT ?accion (COUNT(DISTINCT ?q) AS ?usan) WHERE {
      ?q a doap:Project ; ontologia:tieneWorkflow/k:tieneUso/k:accion ?accion .
    } GROUP BY ?accion }
  ?proyecto a doap:Project .
  FILTER EXISTS { ?proyecto ontologia:tieneWorkflow ?algun . }
  FILTER NOT EXISTS { ?proyecto ontologia:tieneWorkflow/k:tieneUso/k:accion ?accion . }
  BIND(?total - 1 AS ?otros)
  FILTER(2 * ?usan >= ?otros)
}
ORDER BY ?proyecto DESC(?usan) ?accion`),
  },
  {
    id: "tecnologias-mas-pedidas",
    nombre: "Tecnologías más pedidas",
    pregunta: "En cuántos puestos aparece cada tecnología.",
    sparql: conPrefijos(`SELECT ?tecnologia (COUNT(DISTINCT ?puesto) AS ?puestos) WHERE {
  ?puesto a ontologia:JobPost ; ontologia:pide ?tecnologia .
}
GROUP BY ?tecnologia
ORDER BY DESC(?puestos) ?tecnologia`),
  },
  {
    id: "acciones-por-proyecto",
    nombre: "Acciones por proyecto",
    pregunta: "Qué acción usa cada proyecto, siguiendo workflow → uso → acción (un property path).",
    sparql: conPrefijos(`SELECT DISTINCT ?proyecto ?accion WHERE {
  ?proyecto ontologia:tieneWorkflow/k:tieneUso/k:accion ?accion .
}
ORDER BY ?proyecto ?accion`),
  },
];

export function buscarPrearmada(id: string): Prearmada | undefined {
  return PREARMADAS.find((p) => p.id === id);
}
