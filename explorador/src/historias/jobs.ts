// jobs: la clase JobPost de la ontología. Una historia por función de jobs.ts.
import { jobs } from "../../../mod.ts";
import { type Clase, type Control, opcional } from "./tipos.ts";

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
    {
      id: "jobs.get",
      clase: "jobs",
      funcion: "jobs.get",
      nombre: "get",
      llamada: "jobs.get({ tecnologia, fuente })",
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
      correr: (v, { url, fetch }) =>
        jobs.get({ tecnologia: opcional(v.tecnologia), fuente: opcional(v.fuente) }, { url, fetch }),
    },
    {
      id: "jobs.descartar",
      clase: "jobs",
      funcion: "jobs.descartar",
      nombre: "descartar",
      llamada: "jobs.descartar(link, porque, { token })",
      controles: [
        LINK,
        { nombre: "porque", tipo: "texto", requerido: true, descripcion: "por qué no interesa: queda en el puesto" },
      ],
      token: "acciones",
      escribe: true,
      correr: (v, { url, fetch, token }) => jobs.descartar(v.link.trim(), v.porque.trim(), { url, fetch, token }),
    },
    {
      id: "jobs.marcarAplicado",
      clase: "jobs",
      funcion: "jobs.marcarAplicado",
      nombre: "marcarAplicado",
      llamada: "jobs.marcarAplicado(link, { token })",
      controles: [LINK],
      token: "acciones",
      escribe: true,
      correr: (v, { url, fetch, token }) => jobs.marcarAplicado(v.link.trim(), { url, fetch, token }),
    },
  ],
};
