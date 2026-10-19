// renderizar.ts — de los conceptos (ya validados: todos skos:Concept, ninguno related a sí mismo) a los markdown de
// un vocabulario: una página por término, <slug>.md, y README.md como índice. Devuelve nombre de archivo →
// contenido, sin tocar el disco.
//
// Narrower lo calcula el script como inverso de skos:broader, y Related sale en las dos páginas aunque el triple
// esté en una sola: en el TTL nadie escribe ninguno de los dos lados que faltan. Analogous son los otros términos con
// el mismo skos:broader directo (la consulta ANALOGOS de ontologyLearning/core/vocabularios.py), con el padre que
// comparten. Todo va ordenado por label para que la salida no dependa del orden del TTL.
//
// Los términos de `contexto` (los TTL de --context) no llevan página: sirven para nombrar un broader o related que
// cruza de vocabulario ("Entorno aislado (ambiente:)", sin link) y para encontrar análogos en otros vocabularios.
// Los títulos de las secciones van en el idioma del vocabulario (`TEXTOS`).
//
// Mentioned in sale del grafo (el TTL más los triples de menciones.ts): la consulta inversa `?doc dct:references
// v:<slug>`. Nunca sale de docs/vocabulary/, que es la salida de este script. Sin triples de menciones (un
// vocabulario externo) la sección no sale.

// @ts-types="@types/n3"
import { DataFactory, type Store } from "n3";
import type { Concepto, Literal } from "./leer.ts";
import { DCT_REFERENCES } from "./menciones.ts";

export const CABECERA =
  "<!-- Generated from docs/vocabulary.ttl by `deno task vocabulario`. Do not edit by hand: edit the TTL and run the task. -->";

// Los títulos de sección y el índice, por idioma. Un vocabulario en otro idioma lo rechaza externo.ts.
export const TEXTOS = {
  en: {
    broader: "Broader",
    narrower: "Narrower",
    analogos: "Analogous",
    mismoPadre: "same parent",
    related: "Related",
    ejemplos: "Examples",
    verTambien: "See also",
    menciones: "Mentioned in",
    vocabulario: "Vocabulary",
    fuente: (ttl: string) => `The source is [\`${ttl.split("/").at(-1)}\`](${ttl}), a SKOS vocabulary.`,
    cabecera: (ttl: string) =>
      `<!-- Generated from ${ttl} by \`deno task vocabulario:externo\`. Do not edit by hand: edit the TTL and run the task. -->`,
  },
  es: {
    broader: "Más general",
    narrower: "Más específico",
    analogos: "Análogos",
    mismoPadre: "mismo padre",
    related: "Relacionados",
    ejemplos: "Ejemplos",
    verTambien: "Ver también",
    menciones: "Mencionado en",
    vocabulario: "Vocabulario",
    fuente: (ttl: string) => `La fuente es [\`${ttl.split("/").at(-1)}\`](${ttl}), un vocabulario SKOS.`,
    cabecera: (ttl: string) =>
      `<!-- Generado desde ${ttl} con \`deno task vocabulario:externo\`. No se edita a mano: cambiá el TTL y corré la tarea. -->`,
  },
};

export type Idioma = keyof typeof TEXTOS;

export interface Opciones {
  idioma: Idioma;
  // La primera línea de cada archivo.
  cabecera: string;
  // El título del índice y los párrafos que van entre el título y la lista de términos.
  titulo: string;
  intro: string[];
  // Términos de otros vocabularios: sin página, nombrados con su prefijo.
  contexto: Concepto[];
  // namespace → prefijo, para escribir "(ambiente:)" detrás de un término de contexto.
  prefijos: Map<string, string>;
}

// Las de docs/vocabulary/: con estas la salida es la de siempre, byte por byte.
const DEL_REPO: Opciones = {
  idioma: "en",
  cabecera: CABECERA,
  titulo: "Vocabulary",
  intro: [
    "The terms this project uses, one page each. The source is [`docs/vocabulary.ttl`](../vocabulary.ttl), a SKOS vocabulary.",
  ],
  contexto: [],
  prefijos: new Map(),
};

// El literal en `idioma`; un término de contexto sin ese idioma da el primero que tenga, o `siNo`.
function enIdioma(literales: Literal[], idioma: string, siNo: string): string {
  return (literales.find((l) => l.idioma === idioma) ?? literales[0])?.valor ?? siNo;
}

// Por label sin mayúsculas, después por slug y por IRI: comparación por código, igual en cualquier máquina.
function ordenar(conceptos: Concepto[], label: (c: Concepto) => string): Concepto[] {
  const clave = (c: Concepto) => `${label(c).toLowerCase()}\u0000${c.slug}\u0000${c.iri}`;
  return [...conceptos].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0));
}

function seccion(titulo: string, items: string[]): string[] {
  return items.length ? [`**${titulo}**`, "", ...items.map((i) => `- ${i}`), ""] : [];
}

// Los archivos de prosa que enlazan `c`, en orden, como links que andan desde docs/vocabulary/. Sin repetidos de
// fábrica: el Store guarda cada triple una vez, así dos links del mismo archivo al mismo término son una mención.
function menciones(c: Concepto, grafo: Store): string[] {
  const { namedNode } = DataFactory;
  const docs = grafo.getSubjects(namedNode(DCT_REFERENCES), namedNode(c.iri), null).map((s) => s.value);
  return docs.sort().map((ruta) => `[${texto(ruta)}](${destino(ruta)})`);
}

// Un nombre de archivo como texto de link: escapa los corchetes.
const texto = (ruta: string) => ruta.replace(/[[\]\\]/g, (c) => `\\${c}`);
// Un nombre de archivo como destino desde docs/vocabulary/: espacios y paréntesis codificados para que el link no se
// corte (`docs/my notes (v2).md` → `../../docs/my%20notes%20%28v2%29.md`).
const destino = (ruta: string) => `../../${encodeURI(ruta).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;

// Nombre de archivo (relativo a la carpeta de salida) → contenido, con las claves en orden.
export function renderizar(conceptos: Concepto[], grafo: Store, opciones: Partial<Opciones> = {}): Map<string, string> {
  const o = { ...DEL_REPO, ...opciones };
  const t = TEXTOS[o.idioma];
  const propios = new Set(conceptos.map((c) => c.iri));
  const todos = [...conceptos, ...o.contexto.filter((c) => !propios.has(c.iri))];
  const porIri = new Map(todos.map((c) => [c.iri, c]));

  const label = (c: Concepto) => enIdioma(c.prefLabel, o.idioma, c.slug);
  const definicion = (c: Concepto) => enIdioma(c.definition, o.idioma, "");
  // Un término propio es link a su página; uno de contexto, su label con el prefijo de su vocabulario.
  const nombre = (c: Concepto) => {
    if (propios.has(c.iri)) return `[${label(c)}](${c.slug}.md)`;
    const ns = c.iri.slice(0, c.iri.length - c.slug.length);
    const prefijo = o.prefijos.get(ns);
    return `${label(c)} (${prefijo ? `${prefijo}:` : `<${ns}>`})`;
  };
  const lista = (iris: Iterable<string>) => ordenar([...new Set(iris)].map((i) => porIri.get(i)!), label);

  // Cada otro término con un broader directo en común con `c` → "nombre — mismo padre: padre[, padre]".
  const analogos = (c: Concepto): string[] =>
    ordenar(todos.filter((x) => x.iri !== c.iri && x.broader.some((p) => c.broader.includes(p))), label).map((x) => {
      const padres = lista(x.broader.filter((p) => c.broader.includes(p)));
      return `${nombre(x)} — ${t.mismoPadre}: ${padres.map(nombre).join(", ")}`;
    });

  const pagina = (c: Concepto): string => {
    const narrower = lista(todos.filter((x) => x.broader.includes(c.iri)).map((x) => x.iri));
    const related = lista([...c.related, ...todos.filter((x) => x.related.includes(c.iri)).map((x) => x.iri)]);
    const ejemplos = c.example.filter((l) => l.idioma === o.idioma || l.idioma === "").map((l) => l.valor);
    const lineas = [
      o.cabecera,
      "",
      `# ${label(c)}`,
      "",
      definicion(c),
      "",
      ...seccion(t.ejemplos, [...new Set(ejemplos)].sort()),
      ...seccion(t.broader, lista(c.broader).map(nombre)),
      ...seccion(t.narrower, narrower.map(nombre)),
      ...seccion(t.analogos, analogos(c)),
      ...seccion(t.related, related.map(nombre)),
      ...seccion(t.verTambien, [...new Set(c.seeAlso.map((s) => s.valor))].sort().map((url) => `<${url}>`)),
      ...seccion(t.menciones, menciones(c, grafo)),
    ];
    return lineas.join("\n").trimEnd() + "\n";
  };

  const indice = [
    o.cabecera,
    "",
    `# ${o.titulo}`,
    "",
    ...o.intro.flatMap((p) => [p, ""]),
    ...ordenar(conceptos, label).map((c) => `- ${nombre(c)}: ${definicion(c)}`),
  ].join("\n") + "\n";

  const archivos = new Map<string, string>([["README.md", indice]]);
  for (const c of [...conceptos].sort((a, b) => (a.slug < b.slug ? -1 : 1))) archivos.set(`${c.slug}.md`, pagina(c));
  return archivos;
}
