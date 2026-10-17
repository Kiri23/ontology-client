// menciones.ts — qué términos del vocabulario enlaza la prosa del repo, como triples
// `<archivo> dct:references v:<slug>`. Van al mismo grafo que el TTL y renderizar escribe "Mentioned in" con la
// consulta inversa (`?doc dct:references v:rdf`).
//
// Prosa es un README.md en cualquier carpeta y todo .md dentro de una carpeta docs/, salvo docs/vocabulary/. La lista
// sale de recorrer el repo, nunca de un parámetro: node_modules, .git, dist y generado/ no se recorren.
//
// LA SALIDA NUNCA ES ENTRADA: docs/vocabulary/ no se lee. Lo escribe este mismo script y sus páginas se enlazan entre
// sí (Broader, Related, el índice). Si se leyeran, cada Related volvería como Mentioned in, y el resultado dependería
// de lo que dejó la corrida anterior: generar dos veces podría no dar lo mismo. Las relaciones entre términos salen
// solo del TTL; las menciones, solo de la prosa.
//
// Un link `[texto](ruta)` es mención si, resuelto relativo al archivo que lo tiene, apunta a
// docs/vocabulary/<slug>.md, con o sin #ancla. Las URLs con esquema, las que empiezan con / y los links dentro de un
// bloque de código no cuentan. Si <slug> no es un término lo dice validar.ts, no este archivo.

// @ts-types="@types/n3"
import { DataFactory, type Quad } from "n3";
import { NAMESPACE } from "./validar.ts";

export const DCT_REFERENCES = "http://purl.org/dc/terms/references";

// La salida del script, relativa a la raíz del repo.
const SALIDA = "docs/vocabulary/";
const NO_RECORRER = new Set(["node_modules", ".git", "dist", "generado"]);

const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+[^)]*)?\)/g;
const ABSOLUTA = /^([a-z][a-z0-9+.-]*:|\/)/i;
const PAGINA = /^\/docs\/vocabulary\/([^/]+)\.md$/;
const CERCA = /^\s*(```|~~~)/;

export interface Enlace {
  // Ruta relativa a la raíz del repo, con /.
  archivo: string;
  linea: number;
  // El destino tal como está escrito en el archivo.
  link: string;
  // El nombre de la página a la que apunta, sin .md; puede no ser un término.
  slug: string;
}

// Si `ruta` (relativa a la raíz, con /) es prosa que puede mencionar términos.
export function esProsa(ruta: string): boolean {
  if (ruta.startsWith(SALIDA)) return false; // la salida nunca es entrada: ver arriba
  const partes = ruta.split("/");
  return partes.at(-1) === "README.md" || (ruta.endsWith(".md") && partes.slice(0, -1).includes("docs"));
}

// Cada archivo de prosa bajo `raiz` → su contenido.
export async function leerProsa(raiz: URL): Promise<Map<string, string>> {
  const prosa = new Map<string, string>();
  const recorrer = async (relativa: string) => {
    for await (const e of Deno.readDir(new URL(relativa, raiz))) {
      const ruta = relativa + e.name;
      if (e.isDirectory && !NO_RECORRER.has(e.name)) await recorrer(`${ruta}/`);
      else if (e.isFile && esProsa(ruta)) prosa.set(ruta, await Deno.readTextFile(new URL(ruta, raiz)));
    }
  };
  await recorrer("");
  return prosa;
}

// Los links de la prosa a una página de docs/vocabulary/ (menos su índice), en el orden en que aparecen.
export function enlacesAlVocabulario(prosa: Map<string, string>): Enlace[] {
  const enlaces: Enlace[] = [];
  for (const [archivo, texto] of prosa) {
    let enCodigo = false;
    texto.split("\n").forEach((renglon, i) => {
      if (CERCA.test(renglon)) enCodigo = !enCodigo;
      if (enCodigo) return;
      for (const [, link] of renglon.matchAll(LINK)) {
        if (ABSOLUTA.test(link) || link.startsWith("#")) continue;
        const pagina = decodeURIComponent(new URL(link, `file:///${archivo}`).pathname).match(PAGINA);
        if (pagina && pagina[1] !== "README") enlaces.push({ archivo, linea: i + 1, link, slug: pagina[1] });
      }
    });
  }
  return enlaces;
}

// Un triple `<archivo> dct:references v:<slug>` por enlace; el Store de n3 junta los repetidos.
export function triplesDeMenciones(enlaces: Enlace[]): Quad[] {
  const { quad, namedNode } = DataFactory;
  return enlaces.map((e) => quad(namedNode(e.archivo), namedNode(DCT_REFERENCES), namedNode(NAMESPACE + e.slug)));
}
