// Qué es una historia. Como en Storybook, una historia es una forma de usar algo con sus controles; acá ese algo es
// una función del SDK. Este directorio es TypeScript puro, sin React: lo importa la app (Vite) y también el test de
// cobertura de la raíz (Deno, tests/explorador.test.ts), que falla si una función de mod.ts no tiene historia.

/** Un parámetro de la función, como control del formulario. */
export interface Control {
  /** La clave en los valores y en la URL: `tecnologia`, `porque`. */
  nombre: string;
  /** texto: una línea · parrafo: un textarea (una ficha Turtle) · pares: `clave=valor` por línea. */
  tipo: "texto" | "parrafo" | "pares";
  /** Lo que dice el contrato o el JSDoc del parámetro. */
  descripcion?: string;
  requerido?: boolean;
  /** Valores típicos, para un datalist: `python`, `hn`. */
  sugerencias?: string[];
  /** Con qué arranca el control. */
  inicial?: string;
}

/** Los valores del formulario, por nombre de control. Todo es texto: cada historia lo convierte. */
export type Valores = Record<string, string>;

/** Qué token pide una historia. Cada uno es un secret distinto del servidor. */
export type Token = "acciones" | "proyectos";

/** Lo que la app le pasa a una historia al correrla. */
export interface Contexto {
  /** La URL base del servidor: window.location.origin (en producción es la de la API). */
  url: string;
  /** El fetch que el SDK usa (su opción `fetch`): la app lo envuelve para ver el status y el pedido. */
  fetch: (pedido: Request) => Promise<Response>;
  /** El token, si la historia pide uno y la página lo tiene. Nunca sale de la memoria de la pestaña. */
  token?: string;
}

/** Una función del SDK con sus controles, lista para correr. */
export interface Historia {
  /** Único, va en la URL: `jobs.get`, `crearCliente.GET./reportes/demanda`. */
  id: string;
  /** La clase del SDK que la agrupa en la barra lateral: `jobs`, `proyectos`, `cliente`. */
  clase: string;
  /** La función de mod.ts que corre, por su nombre de acceso: `jobs.get`, `crearCliente`. La exige el test. */
  funcion: string;
  /** Cómo se ve en la barra: `get`, `GET /reportes/demanda`. */
  nombre: string;
  /** La llamada como se escribiría, para la cabecera: `jobs.get({ tecnologia })`. */
  llamada: string;
  /** Lo que la historia agrega al JSDoc de la función (el summary del contrato, por ejemplo). */
  nota?: string;
  controles: Control[];
  /** El token que necesita. Sin él, el botón Correr queda deshabilitado. */
  token?: Token;
  /** Escribe en el servidor: la app pide confirmación antes de correrla. */
  escribe?: boolean;
  correr(valores: Valores, contexto: Contexto): Promise<unknown>;
}

/** Una clase del SDK: un módulo de mod.ts (`jobs`) o una función suelta que hace de clase (`validarProyecto`). */
export interface Clase {
  id: string;
  /** El nombre en la barra: `jobs`. */
  nombre: string;
  /** La clase de la ontología o del SDK que representa: `JobPost`, `Client<paths>`. */
  representa: string;
  historias: Historia[];
}

/** Un valor de control vacío cuenta como no dado: `""` → `undefined`. */
export function opcional(valor: string | undefined): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio : undefined;
}

/** `clave=valor` por línea → objeto. Las líneas vacías o sin `=` se ignoran. */
export function pares(texto: string | undefined): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of (texto ?? "").split("\n")) {
    const i = linea.indexOf("=");
    if (i <= 0) continue;
    const clave = linea.slice(0, i).trim();
    if (clave) salida[clave] = linea.slice(i + 1).trim();
  }
  return salida;
}
