// proyectos: validarProyecto, la función suelta de mod.ts que valida una ficha proyecto.ttl. No escribe nada en el
// servidor, pero pide el token de proyectos.
import { validarProyecto } from "../../../mod.ts";
import { type Clase, historia } from "./tipos.ts";

const FICHA = `@prefix k: <https://kiri23.dev/catalogo#> .
@prefix doap: <http://usefulinc.com/ns/doap#> .

k:mi-proyecto a k:Proyecto ;
    doap:shortdesc "Una línea que dice qué es." .
`;

export const PROYECTOS: Clase = {
  id: "proyectos",
  nombre: "proyectos",
  representa: "k:Proyecto",
  historias: [
    historia({
      id: "validarProyecto",
      clase: "proyectos",
      fn: validarProyecto,
      funcion: "validarProyecto",
      nombre: "validarProyecto",
      llamada: "validarProyecto(turtle, { token })",
      nota: "Nunca tira: un 401 o un 503 vuelven como { ok: false, status, error }.",
      controles: [
        { nombre: "turtle", tipo: "parrafo", requerido: true, descripcion: "la ficha, text/turtle", inicial: FICHA },
      ],
      token: "proyectos",
      llamar: (validar, v, { url, fetch, token }) => validar(v.turtle, { token: token ?? "", url, fetch }),
    }),
  ],
};
