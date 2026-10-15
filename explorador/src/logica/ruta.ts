// La historia elegida y sus valores viven en el hash, como el ?path=&args= de Storybook: un link abre la historia
// con los mismos controles. `#/jobs.get?tecnologia=python`. Va en el hash y no en el path para que el servidor
// estático no tenga que conocer las rutas de la app. Los tokens nunca van acá.

import type { Valores } from "../historias/index.ts";

export interface Ruta {
  /** El id de la historia, o "" si el hash está vacío. */
  id: string;
  /** Solo los valores que vinieron en el hash: los demás controles usan su inicial. */
  valores: Valores;
}

export function leerRuta(hash: string): Ruta {
  const sinPrefijo = hash.replace(/^#\/?/, "");
  const i = sinPrefijo.indexOf("?");
  const id = decodeURIComponent(i < 0 ? sinPrefijo : sinPrefijo.slice(0, i));
  const valores: Valores = {};
  if (i >= 0) for (const [k, v] of new URLSearchParams(sinPrefijo.slice(i + 1))) valores[k] = v;
  return { id, valores };
}

/** El hash de una historia con sus valores. Los vacíos no van: un link corto es un link que se comparte. */
export function escribirRuta({ id, valores }: Ruta): string {
  const query = new URLSearchParams(Object.entries(valores).filter(([, v]) => v !== ""));
  // El id lleva "/" (cliente.GET/reportes/demanda): se deja legible, solo se escapa lo que rompería el hash.
  const legible = encodeURI(id).replace(/[?#]/g, encodeURIComponent);
  const q = query.toString();
  return `#/${legible}${q ? `?${q}` : ""}`;
}
