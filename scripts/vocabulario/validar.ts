// validar.ts — las reglas del vocabulario. Devuelve un error por regla rota, cada uno con el término adelante;
// lista vacía si el vocabulario está bien.
//
//   - exactamente un skos:prefLabel y una skos:definition en @en, y ninguno sin @en;
//   - el local name sirve de nombre de archivo (minúsculas, dígitos y guiones) y no se repite;
//   - skos:broader y skos:related apuntan a un skos:Concept del vocabulario;
//   - rdfs:seeAlso es una URL http(s);
//   - skos:broader no tiene ciclos.

import type { Concepto, Literal } from "./leer.ts";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function literalesEn(c: Concepto, propiedad: "prefLabel" | "definition", literales: Literal[]): string[] {
  const errores = literales
    .filter((l) => l.idioma !== "en")
    .map((l) => `${c.slug}: skos:${propiedad} "${l.valor}" no tiene @en`);
  const en = literales.filter((l) => l.idioma === "en").length;
  if (en !== 1) errores.push(`${c.slug}: tiene ${en} skos:${propiedad} en @en; tiene que tener exactamente uno`);
  return errores;
}

// Cada ciclo de skos:broader, una vez, como "a → b → a".
function ciclos(conceptos: Concepto[]): string[] {
  const porIri = new Map(conceptos.map((c) => [c.iri, c]));
  const estado = new Map<string, "visitando" | "listo">();
  const pila: string[] = [];
  const encontrados: string[] = [];
  const visitar = (iri: string) => {
    estado.set(iri, "visitando");
    pila.push(iri);
    for (const padre of porIri.get(iri)!.broader) {
      if (!porIri.has(padre)) continue;
      if (estado.get(padre) === "visitando") {
        const ciclo = [...pila.slice(pila.indexOf(padre)), padre].map((i) => porIri.get(i)!.slug);
        encontrados.push(`ciclo en skos:broader: ${ciclo.join(" → ")}`);
      } else if (!estado.has(padre)) visitar(padre);
    }
    pila.pop();
    estado.set(iri, "listo");
  };
  for (const c of conceptos) if (!estado.has(c.iri)) visitar(c.iri);
  return encontrados;
}

export function validar(conceptos: Concepto[]): string[] {
  const errores: string[] = [];
  const iris = new Set(conceptos.map((c) => c.iri));
  const slugs = new Map<string, string>();
  for (const c of conceptos) {
    errores.push(...literalesEn(c, "prefLabel", c.prefLabel), ...literalesEn(c, "definition", c.definition));
    if (!SLUG.test(c.slug) || c.slug === "readme") {
      errores.push(`${c.iri}: el local name "${c.slug}" tiene que ser minúsculas, dígitos y guiones, y no "readme"`);
    } else if (slugs.has(c.slug)) {
      errores.push(`${c.slug}: ${c.iri} y ${slugs.get(c.slug)} tienen el mismo local name`);
    }
    slugs.set(c.slug, c.iri);
    for (const propiedad of ["broader", "related"] as const) {
      for (const destino of c[propiedad]) {
        if (!iris.has(destino)) {
          errores.push(`${c.slug}: skos:${propiedad} apunta a ${destino}, que no es un skos:Concept del vocabulario`);
        }
      }
    }
    for (const url of c.seeAlso) {
      if (!/^https?:\/\//.test(url)) errores.push(`${c.slug}: rdfs:seeAlso "${url}" no es una URL http(s)`);
    }
  }
  return [...errores, ...ciclos(conceptos)];
}
