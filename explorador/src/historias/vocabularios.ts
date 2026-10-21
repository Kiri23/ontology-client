// vocabularios: validarVocabulario, la función suelta de mod.ts que valida un vocabulary.ttl (un skos:ConceptScheme con
// sus términos). Como validarProyecto: no escribe nada en el servidor, pero pide el token de proyectos.
import { validarVocabulario } from "../../../mod.ts";
import { type Clase, historia } from "./tipos.ts";

const VOCABULARIO = `@prefix mi:   <https://kiri231.com/vocabulario/mi#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

mi:vocabulario a skos:ConceptScheme ;
    skos:prefLabel "Mi vocabulario"@es ;
    skos:definition "Una línea que dice de qué son los términos."@es .

mi:termino a skos:Concept ;
    skos:inScheme mi:vocabulario ;
    skos:prefLabel "Término"@es ;
    skos:definition "Una línea que dice qué es."@es .
`;

export const VOCABULARIOS: Clase = {
  id: "vocabularios",
  nombre: "vocabularios",
  representa: "skos:ConceptScheme",
  historias: [
    historia({
      id: "validarVocabulario",
      clase: "vocabularios",
      fn: validarVocabulario,
      funcion: "validarVocabulario",
      nombre: "validarVocabulario",
      llamada: "validarVocabulario(turtle, { token })",
      nota:
        "Mismo token y mismo Resultado que validarProyecto: un 401 o un 503 vuelven como { ok: false, status, error }.",
      controles: [
        {
          nombre: "turtle",
          tipo: "parrafo",
          requerido: true,
          descripcion: "el vocabulary.ttl, text/turtle",
          inicial: VOCABULARIO,
        },
      ],
      token: "proyectos",
      llamar: (validar, v, { url, fetch, token }) => validar(v.turtle, { token: token ?? "", url, fetch }),
    }),
  ],
};
