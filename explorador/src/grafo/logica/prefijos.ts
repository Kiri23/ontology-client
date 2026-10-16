// Los prefijos del grafo y cómo se escribe una IRI para leerla: `k:Action` si tiene prefijo, `<…>` si no, y un nombre
// corto para el lienzo (`actions/checkout`). Sin React ni motor: lo usan el lienzo, el validador y las consultas.

export const PREFIJOS: Record<string, string> = {
  k: "https://kiri23.dev/catalogo#",
  j: "https://kiri23.dev/jobs#",
  t: "https://kiri23.dev/tech#",
  doap: "http://usefulinc.com/ns/doap#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dcterms: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

export const RDF_TYPE = PREFIJOS.rdf + "type";

// Lo que va después del prefijo tiene que ser un nombre local válido en SPARQL; si no, la IRI va entera.
const LOCAL = /^[A-Za-z_][\w-]*$/;

/** `https://kiri23.dev/catalogo#Action` → `k:Action`; sin prefijo conocido, `<https://…>`. */
export function compacto(iri: string): string {
  for (const [prefijo, base] of Object.entries(PREFIJOS)) {
    if (iri.startsWith(base) && LOCAL.test(iri.slice(base.length))) return `${prefijo}:${iri.slice(base.length)}`;
  }
  return `<${iri}>`;
}

/**
 * Un nombre corto para el lienzo y la ficha, cuando el nodo no trae etiqueta.
 * `…/actions/checkout#.` → `actions/checkout` · `…#.github/actions/pm-actividad` → `pm-actividad` ·
 * `…/workflow/JobSearch.kiri-pm` → `JobSearch.kiri-pm` · `urn:kiri-repos:workflows` → `workflows`.
 */
export function nombreCorto(iri: string): string {
  const [base, fragmento = ""] = iri.split("#");
  if (fragmento && fragmento !== ".") return fragmento.split("/").filter(Boolean).at(-1) ?? fragmento;
  const partes = base.split(/[/:]/).filter(Boolean);
  if (fragmento === ".") return partes.slice(-2).join("/");
  return partes.at(-1) ?? iri;
}

/** Las líneas `PREFIX` de los prefijos que el texto usa (`k:`, `doap:`…), en el orden de {@link PREFIJOS}. */
export function declaraciones(texto: string): string {
  return Object.entries(PREFIJOS)
    .filter(([p]) => new RegExp(`(^|[\\s(/^|{.;,])${p}:`).test(texto))
    .map(([p, base]) => `PREFIX ${p}: <${base}>\n`)
    .join("");
}

/** Lo inverso de {@link compacto}: `k:Action` → la IRI entera; `<…>` sin los signos; otra cosa, tal cual. */
export function expandir(texto: string): string {
  const entre = /^<(.*)>$/.exec(texto);
  if (entre) return entre[1];
  const i = texto.indexOf(":");
  const base = i > 0 ? PREFIJOS[texto.slice(0, i)] : undefined;
  return base ? base + texto.slice(i + 1) : texto;
}
