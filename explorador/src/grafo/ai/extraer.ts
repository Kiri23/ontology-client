// De lo que escribió el modelo a una consulta para el editor: el bloque ```sparql (o el primero que haya, o el texto
// crudo desde la primera palabra clave) y las líneas PREFIX que falten. No valida: eso es del validador.
import { declaraciones } from "../logica/prefijos.ts";

const CLAVE = /\b(PREFIX|BASE|SELECT|ASK|CONSTRUCT|DESCRIBE|INSERT|DELETE|LOAD)\b/i;

/** El SPARQL que hay en el texto generado; "" si no hay nada que se le parezca. */
export function extraerSparql(texto: string): string {
  const bloques = [...texto.matchAll(/```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)];
  const bloque = bloques.find((b) => b[1].toLowerCase() === "sparql") ?? bloques[0];
  if (bloque) return bloque[2].trim();
  const inicio = texto.search(CLAVE);
  return inicio < 0 ? "" : texto.slice(inicio).replace(/```\s*$/, "").trim();
}

/** Agrega arriba las líneas PREFIX de los prefijos conocidos que la consulta usa y no declara. */
export function completarPrefijos(sparql: string): string {
  const declarados = new Set([...sparql.matchAll(/^\s*PREFIX\s+([\w-]*):/gim)].map((m) => m[1]));
  const faltan = declaraciones(sparql.replace(/^\s*PREFIX[^\n]*$/gim, ""))
    .split("\n")
    .filter((linea) => linea && !declarados.has(/^PREFIX ([\w-]*):/.exec(linea)![1]));
  return faltan.length ? `${faltan.join("\n")}\n${sparql}` : sparql;
}

/** El texto del modelo, listo para el editor. */
export const consultaPropuesta = (texto: string) => {
  const sparql = extraerSparql(texto);
  return sparql ? completarPrefijos(sparql) : texto.trim();
};
