// cliente: crearCliente(), el Client de openapi-fetch con los paths del contrato. Lo que el SDK todavía no envuelve
// en una función (los reportes, /preguntar, /jobs/con-mi-stack) se usa por acá, así que hay una historia por cada GET
// del contrato, con sus parámetros de query como controles. Salen de contrato/openapi.json: un GET nuevo en el
// contrato es una historia nueva sin tocar este archivo. Solo GET: los POST escriben y tienen su función (o no la
// tienen a propósito, como POST /jobs).
import { crearCliente, ErrorServidor } from "../../../mod.ts";
import contrato from "../../../contrato/openapi.json" with { type: "json" };
import { type Clase, type Control, type Historia, opcional, pares } from "./tipos.ts";

interface Parametro {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  style?: string;
  explode?: boolean;
  schema?: { type?: string };
}
interface Operacion {
  summary?: string;
  parameters?: Parametro[];
}

// Un objeto con style form y explode (los filtros de /preguntar) va como parámetros sueltos: ?tecnologia=python.
const esFormExplotado = (p: Parametro) => p.schema?.type === "object" && p.style === "form" && p.explode !== false;

// openapi-fetch tipa GET con la unión de los paths del contrato; acá el path es un string que sale del mismo contrato.
type GetSuelto = (
  path: string,
  init: { params: { query: Record<string, string> } },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

function historiaGet(path: string, operacion: Operacion): Historia {
  const query = (operacion.parameters ?? []).filter((p) => p.in === "query");
  const controles: Control[] = query.map((p) => ({
    nombre: p.name,
    tipo: esFormExplotado(p) ? "pares" : "texto",
    descripcion: p.description,
    requerido: p.required,
  }));
  return {
    id: `cliente.GET${path}`,
    clase: "cliente",
    funcion: "crearCliente",
    nombre: `GET ${path}`,
    llamada: `crearCliente().GET("${path}"${query.length ? ", { params: { query } }" : ""})`,
    nota: operacion.summary,
    controles,
    async correr(valores, { url, fetch }) {
      const params: Record<string, string> = {};
      for (const p of query) {
        if (esFormExplotado(p)) Object.assign(params, pares(valores[p.name]));
        else if (opcional(valores[p.name]) !== undefined) params[p.name] = valores[p.name].trim();
      }
      const cliente = crearCliente({ baseUrl: url, fetch });
      const get = cliente.GET as unknown as GetSuelto;
      const { data, error, response } = await get(path, { params: { query: params } });
      if (response.ok) return data;
      const mensaje = (error as { error?: unknown } | undefined)?.error;
      throw new ErrorServidor(response.status, typeof mensaje === "string" ? mensaje : `HTTP ${response.status}`);
    },
  };
}

const paths = contrato.paths as Record<string, { get?: Operacion }>;

export const CLIENTE: Clase = {
  id: "cliente",
  nombre: "crearCliente",
  representa: "Client<paths>",
  historias: Object.entries(paths)
    .filter(([, metodos]) => metodos.get)
    .map(([path, metodos]) => historiaGet(path, metodos.get!)),
};
