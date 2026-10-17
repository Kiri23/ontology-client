// menciones.ts — qué términos del vocabulario enlaza la prosa del repo, como triples
// `<archivo> dct:references v:<slug>`. Van al mismo grafo que el TTL y renderizar escribe "Mentioned in" con la
// consulta inversa (`?doc dct:references v:rdf`).
//
// Prosa es un README.md en cualquier carpeta y todo .md dentro de una carpeta docs/, salvo docs/vocabulary/. La lista
// sale de `git ls-files`, nunca de un parámetro: un .md sin trackear no cambia la salida local (y CI, que no lo
// tiene, daría otra cosa). Nada bajo node_modules, .git, dist o generado/ cuenta aunque esté trackeado.
//
// LA SALIDA NUNCA ES ENTRADA: docs/vocabulary/ no se lee. Lo escribe este mismo script y sus páginas se enlazan entre
// sí (Broader, Related, el índice). Si se leyeran, cada Related volvería como Mentioned in, y el resultado dependería
// de lo que dejó la corrida anterior: generar dos veces podría no dar lo mismo. Las relaciones entre términos salen
// solo del TTL; las menciones, solo de la prosa.
//
// Un link `[texto](ruta)` es mención si, resuelto relativo al archivo que lo tiene, apunta a
// docs/vocabulary/<slug>.md, con o sin #ancla. Las URLs con esquema, las que empiezan con / y los links dentro de un
// bloque de código o de un `span` no cuentan. Si <slug> no es un término (o no se puede decodificar, como un % suelto)
// lo dice validar.ts, no este archivo.
//
// Límites conocidos: no se leen links de referencia ([x][r]), <a href>, imágenes ni comentarios HTML, y las rutas
// se comparan con mayúsculas tal cual.

// @ts-types="@types/n3"
import { DataFactory, type Quad } from "n3";
import { NAMESPACE } from "./validar.ts";

export const DCT_REFERENCES = "http://purl.org/dc/terms/references";

// La salida del script, relativa a la raíz del repo.
const SALIDA = "docs/vocabulary/";
const NO_LEER = new Set(["node_modules", ".git", "dist", "generado"]);

const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+[^)]*)?\)/g;
const ABSOLUTA = /^([a-z][a-z0-9+.-]*:|\/)/i;
const PAGINA = /^\/docs\/vocabulary\/([^/]+)\.md$/;
// Apertura de un bloque de código: hasta 3 espacios y 3 o más ` o ~. Cierra el mismo carácter, igual de largo o más.
const CERCA = /^ {0,3}(`{3,}|~{3,})/;
const CIERRE = /^ {0,3}(`{3,}|~{3,})\s*$/;
// Un span de código en línea: n backticks, lo que sea, los mismos n backticks.
const SPAN = /(`+).*?\1/g;

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
  if (partes.some((p) => NO_LEER.has(p))) return false;
  return partes.at(-1) === "README.md" || (ruta.endsWith(".md") && partes.slice(0, -1).includes("docs"));
}

// Cada archivo de prosa que git trackea bajo `raiz` → su contenido.
export async function leerProsa(raiz: URL): Promise<Map<string, string>> {
  const { code, stdout, stderr } = await new Deno.Command("git", {
    args: ["ls-files", "-z", "--", "*.md"],
    cwd: raiz,
  }).output();
  if (code !== 0) throw new Error(`git ls-files falló en ${raiz.pathname}: ${new TextDecoder().decode(stderr)}`);
  const rutas = new TextDecoder().decode(stdout).split("\0").filter((r) => r && esProsa(r)).sort();
  const prosa = new Map<string, string>();
  for (const ruta of rutas) prosa.set(ruta, await Deno.readTextFile(new URL(ruta, raiz)));
  return prosa;
}

// El camino de un link resuelto contra su archivo, decodificado; sin decodificar si trae un % suelto.
function camino(link: string, archivo: string): string {
  const crudo = new URL(link, `file:///${archivo}`).pathname;
  try {
    return decodeURIComponent(crudo);
  } catch {
    return crudo;
  }
}

// Los renglones de `texto` que son prosa (fuera de bloques de código), con su número.
function renglonesDeProsa(texto: string): [number, string][] {
  const fuera: [number, string][] = [];
  let bloque = "";
  texto.split("\n").forEach((renglon, i) => {
    if (bloque) {
      const cierre = renglon.match(CIERRE)?.[1];
      if (cierre && cierre[0] === bloque[0] && cierre.length >= bloque.length) bloque = "";
      return;
    }
    const apertura = renglon.match(CERCA)?.[1];
    if (apertura) bloque = apertura;
    else fuera.push([i + 1, renglon]);
  });
  return fuera;
}

// Los links de la prosa a una página de docs/vocabulary/ (menos su índice), en el orden en que aparecen.
export function enlacesAlVocabulario(prosa: Map<string, string>): Enlace[] {
  const enlaces: Enlace[] = [];
  for (const [archivo, texto] of prosa) {
    for (const [linea, renglon] of renglonesDeProsa(texto)) {
      for (const [, link] of renglon.replace(SPAN, "").matchAll(LINK)) {
        if (ABSOLUTA.test(link) || link.startsWith("#")) continue;
        const pagina = camino(link, archivo).match(PAGINA);
        if (pagina && pagina[1] !== "README") enlaces.push({ archivo, linea, link, slug: pagina[1] });
      }
    }
  }
  return enlaces;
}

// Un triple `<archivo> dct:references v:<slug>` por enlace; el Store de n3 junta los repetidos.
export function triplesDeMenciones(enlaces: Enlace[]): Quad[] {
  const { quad, namedNode } = DataFactory;
  return enlaces.map((e) => quad(namedNode(e.archivo), namedNode(DCT_REFERENCES), namedNode(NAMESPACE + e.slug)));
}
