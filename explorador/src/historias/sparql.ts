// sparql: GET /sparql, la consulta SPARQL cruda contra el grafo del servidor. Solo lee: el servidor no corre UPDATE.
// La vista Grafo (src/grafo/) usa esta misma función para traer el grafo entero.
import { sparql } from "../../../mod.ts";
import { type Clase, historia, opcional } from "./tipos.ts";

const EJEMPLO = `PREFIX k: <https://kiri23.dev/catalogo#>
SELECT ?accion (COUNT(?uso) AS ?usos) WHERE {
  ?uso a k:Uso ; k:accion ?accion .
}
GROUP BY ?accion
ORDER BY DESC(?usos)
LIMIT 5`;

export const SPARQL: Clase = {
  id: "sparql",
  nombre: "sparql",
  representa: "SPARQL 1.1",
  historias: [
    historia({
      id: "sparql.consultar",
      clase: "sparql",
      fn: sparql.consultar,
      funcion: "sparql.consultar",
      nombre: "consultar",
      llamada: "sparql.consultar(consulta, { accept })",
      nota: "Devuelve el texto tal cual: { tipo, texto }. La vista Grafo lo lee con un motor SPARQL local.",
      controles: [
        {
          nombre: "consulta",
          tipo: "parrafo",
          requerido: true,
          descripcion: "SELECT, ASK o CONSTRUCT",
          inicial: EJEMPLO,
        },
        {
          nombre: "accept",
          tipo: "texto",
          descripcion: "el formato de la respuesta; CONSTRUCT siempre vuelve en Turtle",
          sugerencias: ["application/sparql-results+json", "text/csv", "text/turtle"],
        },
      ],
      llamar: (consultar, v, { url, fetch }) => consultar(v.consulta, { url, fetch, accept: opcional(v.accept) }),
    }),
  ],
};
