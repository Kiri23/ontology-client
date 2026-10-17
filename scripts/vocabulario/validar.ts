// validar.ts — las reglas del vocabulario. Devuelve un error por regla rota, cada uno con el término adelante;
// lista vacía si el vocabulario está bien.
//
//   - hay al menos un skos:Concept, y todo término (lo que tiene prefLabel o definition) es `a skos:Concept`;
//   - un término es un IRI del namespace, no un nodo en blanco, y su local name sirve de nombre de archivo
//     (minúsculas, dígitos y guiones; no "readme");
//   - exactamente un skos:prefLabel y una skos:definition en @en, no vacíos, y ninguno en otro idioma o sin idioma;
//   - skos:broader y skos:related apuntan a un skos:Concept del vocabulario, y related no apunta a sí mismo;
//   - skos:broader no tiene ciclos, y related no une dos términos que broader ya une (SKOS S27: son disjuntas);
//   - rdfs:seeAlso es un IRI http(s), no un literal.
//
// `validarEnlaces` suma la regla de la prosa: un link a docs/vocabulary/<slug>.md tiene que nombrar un término que
// exista. La prosa no puede citar algo que no está en el TTL.

import type { Concepto, Literal } from "./leer.ts";
import { slugDe } from "./leer.ts";
import type { Enlace } from "./menciones.ts";

export const NAMESPACE = "https://kiri23.dev/vocabulario#";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function literalesEn(c: Concepto, propiedad: "prefLabel" | "definition", literales: Literal[]): string[] {
  const errores = literales.filter((l) => l.idioma !== "en").map((l) =>
    `${c.slug}: skos:${propiedad} "${l.valor}" ${
      l.idioma ? `tiene idioma @${l.idioma}` : "no tiene etiqueta de idioma"
    }; se espera @en`
  );
  const en = literales.filter((l) => l.idioma === "en");
  if (en.length !== 1) {
    errores.push(`${c.slug}: tiene ${en.length} skos:${propiedad} en @en; tiene que tener exactamente uno`);
  }
  if (en.some((l) => l.valor.trim() === "")) errores.push(`${c.slug}: skos:${propiedad} está vacío`);
  return errores;
}

// Cada ciclo de skos:broader, una vez, como "a → b → a".
function ciclos(porIri: Map<string, Concepto>): string[] {
  const estado = new Map<string, "visitando" | "listo">();
  const pila: string[] = [];
  const encontrados: string[] = [];
  const visitar = (iri: string) => {
    estado.set(iri, "visitando");
    pila.push(iri);
    for (const padre of porIri.get(iri)!.broader) {
      if (!porIri.has(padre)) continue;
      if (estado.get(padre) === "visitando") {
        const ciclo = [...pila.slice(pila.indexOf(padre)), padre].map(slugDe);
        encontrados.push(`ciclo en skos:broader: ${ciclo.join(" → ")}`);
      } else if (!estado.has(padre)) visitar(padre);
    }
    pila.pop();
    estado.set(iri, "listo");
  };
  for (const iri of porIri.keys()) if (!estado.has(iri)) visitar(iri);
  return encontrados;
}

// Todos los ancestros de `iri` por skos:broader (transitivo); tolera ciclos.
function ancestros(iri: string, porIri: Map<string, Concepto>): Set<string> {
  const vistos = new Set<string>();
  const pendientes = [...(porIri.get(iri)?.broader ?? [])];
  while (pendientes.length) {
    const a = pendientes.pop()!;
    if (vistos.has(a) || !porIri.has(a)) continue;
    vistos.add(a);
    pendientes.push(...porIri.get(a)!.broader);
  }
  return vistos;
}

function relaciones(c: Concepto, porIri: Map<string, Concepto>): string[] {
  const errores: string[] = [];
  for (const propiedad of ["broader", "related"] as const) {
    for (const destino of c[propiedad]) {
      if (!porIri.has(destino)) {
        errores.push(`${c.slug}: skos:${propiedad} apunta a ${destino}, que no es un skos:Concept del vocabulario`);
      }
    }
  }
  for (const r of new Set(c.related)) {
    if (r === c.iri) errores.push(`${c.slug}: skos:related apunta a sí mismo`);
    else if (porIri.has(r) && (ancestros(c.iri, porIri).has(r) || ancestros(r, porIri).has(c.iri))) {
      errores.push(
        `${c.slug}: skos:related y skos:broader (directo o transitivo) unen ${c.slug} con ${slugDe(r)}; ` +
          "SKOS los quiere disjuntos",
      );
    }
  }
  return errores;
}

export function validar(terminos: Concepto[]): string[] {
  const conceptos = terminos.filter((c) => c.esConcepto && !c.enBlanco);
  if (!terminos.some((c) => c.esConcepto)) return ["el vocabulario no tiene ningún skos:Concept"];
  const porIri = new Map(conceptos.map((c) => [c.iri, c]));
  const errores: string[] = [];
  for (const c of terminos) {
    if (c.enBlanco) {
      const label = c.prefLabel[0]?.valor ?? c.iri;
      errores.push(`nodo en blanco "${label}": un término necesita un IRI ${NAMESPACE}<local name>`);
      continue;
    }
    if (!c.esConcepto) {
      errores.push(`${c.slug}: tiene skos:prefLabel o skos:definition pero no es \`a skos:Concept\``);
      continue;
    }
    if (c.iri !== NAMESPACE + c.slug) {
      errores.push(`${c.iri}: un término tiene que estar en el namespace ${NAMESPACE}`);
    } else if (!SLUG.test(c.slug) || c.slug === "readme") {
      errores.push(`${c.iri}: el local name "${c.slug}" tiene que ser minúsculas, dígitos y guiones, y no "readme"`);
    }
    errores.push(...literalesEn(c, "prefLabel", c.prefLabel), ...literalesEn(c, "definition", c.definition));
    errores.push(...relaciones(c, porIri));
    for (const { valor, tipo } of c.seeAlso) {
      if (tipo !== "NamedNode") {
        errores.push(`${c.slug}: rdfs:seeAlso "${valor}" es un ${tipo}; tiene que ser un IRI <https://…>`);
      } else if (!/^https?:\/\//.test(valor)) errores.push(`${c.slug}: rdfs:seeAlso <${valor}> no es una URL http(s)`);
    }
  }
  return [...errores, ...ciclos(porIri)];
}

// Un error por link de la prosa a una página que el TTL no genera, con archivo, línea y link.
export function validarEnlaces(enlaces: Enlace[], terminos: Concepto[]): string[] {
  const slugs = new Set(terminos.filter((c) => c.esConcepto).map((c) => c.slug));
  return enlaces.filter((e) => !slugs.has(e.slug)).map((e) =>
    `${e.archivo}:${e.linea}: el link (${e.link}) apunta a docs/vocabulary/${e.slug}.md, y "${e.slug}" no es un ` +
    "término de docs/vocabulary.ttl"
  );
}
