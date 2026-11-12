// renderizar.ts — de un vocabulario ya validado (ningún término related a sí mismo, todo broader existe) a sus
// markdown: una página por término, <slug>.md, y README.md como índice. Devuelve nombre de archivo → contenido, sin
// tocar el disco. Los términos se leen con la librería (la entrada `./vocabulary` del paquete).
//
// Narrower lo calcula el script como inverso de skos:broader, y Related sale en las dos páginas aunque el triple
// esté en una sola: en el TTL nadie escribe ninguno de los dos lados que faltan. Analogous son los otros términos con
// el mismo skos:broader directo (la consulta ANALOGOS de ontologyLearning/core/vocabularios.py), con el padre que
// comparten. Todo va ordenado por label para que la salida no dependa del orden del TTL.
//
// Los términos de `contexto` (los TTL de --context) no llevan página: sirven para nombrar un broader o related que
// cruza de vocabulario ("Entorno aislado (ambiente:)", sin link) y para encontrar análogos en otros vocabularios.
// Los títulos de las secciones van en el idioma del vocabulario (`TEXTOS`). Ejemplos y Analogous salen solo si las
// opciones los piden (el modo externo); docs/vocabulary/ no los pide y su salida no depende de qué diga su TTL.
//
// Mentioned in sale del grafo del vocabulario (el TTL más los triples de menciones.ts, que vocabulario.ts le suma):
// la consulta inversa `?doc dct:references v:<slug>`. Nunca sale de docs/vocabulary/, que es la salida de este
// script. Sin triples de menciones (un vocabulario externo) la sección no sale.

import { namespaceOf, SKOS, type Term, type Vocabulary } from "@kiri23/ontology-client/vocabulary";
import { DCT_REFERENCES } from "./menciones.ts";

export const CABECERA =
  "<!-- Generated from docs/vocabulary.ttl by `deno task vocabulario`. Do not edit by hand: edit the TTL and run the task. -->";

// Una ruta como destino de link markdown: espacios y paréntesis codificados para que el link no se corte
// (`docs/my notes (v2).md` → `docs/my%20notes%20%28v2%29.md`).
const codificar = (ruta: string) => encodeURI(ruta).replace(/\(/g, "%28").replace(/\)/g, "%29");

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
    fuente: (ttl: string) => `The source is [\`${ttl.split("/").at(-1)}\`](${codificar(ttl)}), a SKOS vocabulary.`,
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
    fuente: (ttl: string) => `La fuente es [\`${ttl.split("/").at(-1)}\`](${codificar(ttl)}), un vocabulario SKOS.`,
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
  contexto: Term[];
  // namespace → prefijo, para escribir "(ambiente:)" detrás de un término de contexto.
  prefijos: Map<string, string>;
  // Las secciones Ejemplos (skos:example) y Analogous (mismo skos:broader directo).
  ejemplos: boolean;
  analogos: boolean;
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
  ejemplos: false,
  analogos: false,
};

// Por label sin mayúsculas, después por slug y por IRI: comparación por código, igual en cualquier máquina.
function ordenar(terminos: Term[], label: (c: Term) => string): Term[] {
  const clave = (c: Term) => `${label(c).toLowerCase()}\u0000${c.id}\u0000${c.iri}`;
  return [...terminos].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0));
}

// Los IRIs a los que un término apunta con skos:broader o skos:related, existan o no en su vocabulario.
const broader = (c: Term) => c.values(`${SKOS}broader`);
const related = (c: Term) => c.values(`${SKOS}related`);

function seccion(titulo: string, items: string[]): string[] {
  return items.length ? [`**${titulo}**`, "", ...items.map((i) => `- ${i}`), ""] : [];
}

// Los archivos de prosa que enlazan `c`, en orden, como links que andan desde docs/vocabulary/. Sin repetidos de
// fábrica: el grafo guarda cada triple una vez, así dos links del mismo archivo al mismo término son una mención.
function menciones(c: Term): string[] {
  const docs = c.referencedBy(DCT_REFERENCES).map((doc) => doc.iri);
  return docs.sort().map((ruta) => `[${texto(ruta)}](${destino(ruta)})`);
}

// Un nombre de archivo como texto de link: escapa los corchetes.
const texto = (ruta: string) => ruta.replace(/[[\]\\]/g, (c) => `\\${c}`);
// Un nombre de archivo de la prosa como destino desde docs/vocabulary/.
const destino = (ruta: string) => `../../${codificar(ruta)}`;

// Nombre de archivo (relativo a la carpeta de salida) → contenido, con las claves en orden.
export function renderizar(vocabulario: Vocabulary, opciones: Partial<Opciones> = {}): Map<string, string> {
  const o = { ...DEL_REPO, ...opciones };
  const t = TEXTOS[o.idioma];
  const conceptos = vocabulario.terms().toArray();
  const propios = new Set(conceptos.map((c) => c.iri));
  const todos = [...conceptos, ...o.contexto.filter((c) => !propios.has(c.iri))];
  const porIri = new Map(todos.map((c) => [c.iri, c]));

  // El texto en el idioma del vocabulario; un término de contexto sin ese idioma da el primero que tenga.
  const label = (c: Term) => c.label(o.idioma) ?? c.label() ?? c.id;
  const definicion = (c: Term) => c.definition(o.idioma) ?? c.definition() ?? "";
  // Un término propio es link a su página; uno de contexto, su label con el prefijo de su vocabulario.
  const nombre = (c: Term) => {
    if (propios.has(c.iri)) return `[${label(c)}](${c.id}.md)`;
    const ns = namespaceOf(c.iri);
    const prefijo = o.prefijos.get(ns);
    return `${label(c)} (${prefijo ? `${prefijo}:` : `<${ns}>`})`;
  };
  const lista = (iris: Iterable<string>) => ordenar([...new Set(iris)].map((i) => porIri.get(i)!), label);

  // Cada otro término con un broader directo en común con `c` → "nombre — mismo padre: padre[, padre]".
  const analogos = (c: Term): string[] => {
    const padres = broader(c);
    const hermanos = todos.filter((x) => x.iri !== c.iri && broader(x).some((p) => padres.includes(p)));
    return ordenar(hermanos, label).map((x) => {
      const comunes = lista(broader(x).filter((p) => padres.includes(p)));
      return `${nombre(x)} — ${t.mismoPadre}: ${comunes.map(nombre).join(", ")}`;
    });
  };

  const pagina = (c: Term): string => {
    const narrower = lista(todos.filter((x) => broader(x).includes(c.iri)).map((x) => x.iri));
    const relacionados = lista([...related(c), ...todos.filter((x) => related(x).includes(c.iri)).map((x) => x.iri)]);
    const ejemplos = c.literals(`${SKOS}example`).filter((l) => l.language === o.idioma || l.language === "")
      .map((l) => l.value);
    const lineas = [
      o.cabecera,
      "",
      `# ${label(c)}`,
      "",
      definicion(c),
      "",
      ...seccion(t.ejemplos, o.ejemplos ? [...new Set(ejemplos)].sort() : []),
      ...seccion(t.broader, lista(broader(c)).map(nombre)),
      ...seccion(t.narrower, narrower.map(nombre)),
      ...seccion(t.analogos, o.analogos ? analogos(c) : []),
      ...seccion(t.related, relacionados.map(nombre)),
      ...seccion(t.verTambien, [...new Set(c.seeAlso())].sort().map((url) => `<${url}>`)),
      ...seccion(t.menciones, menciones(c)),
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
  for (const c of [...conceptos].sort((a, b) => (a.id < b.id ? -1 : 1))) archivos.set(`${c.id}.md`, pagina(c));
  return archivos;
}
