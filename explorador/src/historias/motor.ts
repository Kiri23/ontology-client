// motor: de dónde lee el SDK (motor.ts). En el navegador hay un solo motor que corre, motorHttp, el default:
// motorNeo4j necesita el driver de Neo4j (bolt) y vive en @kiri23/ontology-client/neo4j, que la página no importa.
// Por eso configurar se muestra con motorHttp: deja el estado global como ya estaba, y ninguna otra historia cambia
// de fuente por haberla corrido. Las dos solo leen (GET /jobs): ninguna lleva escribe.
import { configurar, jobs, motorHttp } from "../../../mod.ts";
import { type Clase, type Control, historia, opcional } from "./tipos.ts";

const FILTROS: Control[] = [
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
];
const COLUMNAS = ["titulo", "empresa", "fuente", "link", "pide", "fecha"];

export const MOTOR: Clase = {
  id: "motor",
  nombre: "motor",
  representa: "Motor",
  historias: [
    historia({
      id: "configurar",
      clase: "motor",
      fn: configurar,
      funcion: "configurar",
      nombre: "configurar",
      llamada: "configurar({ motor: motorHttp }); jobs.get({ tecnologia, fuente })",
      nota: "Acá solo con motorHttp, el default: motorNeo4j(driver) no corre en el navegador. Después de configurar, " +
        "jobs.get lee del motor elegido: la tabla es lo que devuelve.",
      columnas: COLUMNAS,
      controles: FILTROS,
      llamar: (configurar, v, { url, fetch }) => {
        configurar({ motor: motorHttp });
        return jobs.get({ tecnologia: opcional(v.tecnologia), fuente: opcional(v.fuente) }, { url, fetch });
      },
    }),
    historia({
      id: "motorHttp.jobs.get",
      clase: "motor",
      fn: motorHttp.jobs.get,
      funcion: "motorHttp.jobs.get",
      nombre: "motorHttp.jobs.get",
      llamada: "motorHttp.jobs.get({ tecnologia, fuente }, {})",
      nota: "El motor directo, sin pasar por configurar: es lo que jobs.get llama cuando no se configuró otro.",
      columnas: COLUMNAS,
      controles: FILTROS,
      llamar: (get, v, { url, fetch }) =>
        get({ tecnologia: opcional(v.tecnologia), fuente: opcional(v.fuente) }, { url, fetch }),
    }),
  ],
};
