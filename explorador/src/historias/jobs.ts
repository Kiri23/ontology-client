// jobs: la clase JobPost de la ontología. Una historia por función de jobs.ts.
import { jobs } from "../../../mod.ts";
import { type Clase, type Control, historia, opcional } from "./tipos.ts";

const LINK: Control = {
  nombre: "link",
  tipo: "texto",
  requerido: true,
  descripcion: "el link del puesto, como sale en jobs.get: https://news.ycombinator.com/item?id=…",
};

export const JOBS: Clase = {
  id: "jobs",
  nombre: "jobs",
  representa: "JobPost",
  historias: [
    historia({
      id: "jobs.get",
      clase: "jobs",
      fn: jobs.get,
      funcion: "jobs.get",
      nombre: "get",
      llamada: "jobs.get({ tecnologia, fuente })",
      columnas: ["titulo", "empresa", "fuente", "link", "pide", "fecha"],
      controles: [
        {
          nombre: "tecnologia",
          tipo: "texto",
          descripcion: "prefLabel o altLabel, sin mayúsculas",
          sugerencias: ["python", "ts", "node", "react", "aws"],
        },
        {
          nombre: "fuente",
          tipo: "texto",
          descripcion: "de qué fuente vino el puesto",
          sugerencias: ["remotive", "hn"],
        },
      ],
      llamar: (get, v, { url, fetch }) =>
        get({ tecnologia: opcional(v.tecnologia), fuente: opcional(v.fuente) }, { url, fetch }),
    }),
    historia({
      id: "jobs.descartar",
      clase: "jobs",
      fn: jobs.descartar,
      funcion: "jobs.descartar",
      nombre: "descartar",
      llamada: "jobs.descartar(link, porque, { token })",
      controles: [
        LINK,
        { nombre: "porque", tipo: "texto", requerido: true, descripcion: "por qué no interesa: queda en el puesto" },
      ],
      token: "acciones",
      escribe: true,
      llamar: (descartar, v, { url, fetch, token }) => descartar(v.link.trim(), v.porque.trim(), { url, fetch, token }),
    }),
    historia({
      id: "jobs.marcarAplicado",
      clase: "jobs",
      fn: jobs.marcarAplicado,
      funcion: "jobs.marcarAplicado",
      nombre: "marcarAplicado",
      llamada: "jobs.marcarAplicado(link, { token })",
      controles: [LINK],
      token: "acciones",
      escribe: true,
      llamar: (marcarAplicado, v, { url, fetch, token }) => marcarAplicado(v.link.trim(), { url, fetch, token }),
    }),
  ],
};
