// Del grafo RDF (las tripletas del Store) a lo que se dibuja: nodos y aristas. Un nodo es una instancia con IRI; los
// literales no son nodos, van como atributos de su sujeto; rdf:type no es arista, es la clase del nodo. El esquema
// (las rdfs:Class y rdf:Property que el grafo trae declaradas) queda fuera del dibujo.
import { nombreCorto, PREFIJOS, RDF_TYPE } from "./prefijos.ts";

/** Un término RDF como lo dan oxigraph y RDF/JS: alcanza con estos campos. */
export interface Termino {
  termType: string;
  value: string;
  datatype?: { value: string };
  language?: string;
}

export interface Triple {
  subject: Termino;
  predicate: Termino;
  object: Termino;
}

export interface Atributo {
  predicado: string;
  valor: string;
}

export interface Nodo {
  iri: string;
  /** La IRI de su clase (rdf:type), o "" si no tiene. Si tiene varias, la primera que aparece. */
  clase: string;
  etiqueta: string;
  atributos: Atributo[];
}

export interface Arista {
  /** Único y estable: `desde predicado hasta`. */
  id: string;
  desde: string;
  predicado: string;
  hasta: string;
}

export interface Modelo {
  nodos: Map<string, Nodo>;
  aristas: Arista[];
}

const ESQUEMA = new Set([PREFIJOS.rdfs + "Class", PREFIJOS.rdf + "Property"]);
/** De dónde sale la etiqueta de un nodo, en este orden. Sin ninguna, su {@link nombreCorto}. */
const ETIQUETAS = [PREFIJOS.rdfs + "label", PREFIJOS.skos + "prefLabel", PREFIJOS.doap + "name"];

export const idArista = (desde: string, predicado: string, hasta: string) => `${desde} ${predicado} ${hasta}`;

/** Arma el modelo dibujable. Los nodos sin clase entran solo si alguna arista los toca. */
export function armarModelo(triples: Iterable<Triple>): Modelo {
  const lista = [...triples];
  const esquema = new Set(
    lista.filter((t) => t.predicate.value === RDF_TYPE && ESQUEMA.has(t.object.value)).map((t) => t.subject.value),
  );
  const nodos = new Map<string, Nodo>();
  const nodo = (iri: string) => {
    let n = nodos.get(iri);
    if (!n) nodos.set(iri, n = { iri, clase: "", etiqueta: "", atributos: [] });
    return n;
  };
  const literales: Triple[] = [];
  const aristas: Arista[] = [];
  for (const t of lista) {
    const s = t.subject.value;
    if (t.subject.termType !== "NamedNode" || esquema.has(s)) continue;
    if (t.object.termType === "Literal") {
      literales.push(t);
    } else if (t.predicate.value === RDF_TYPE) {
      const n = nodo(s);
      if (!n.clase) n.clase = t.object.value;
    } else if (t.object.termType === "NamedNode" && !esquema.has(t.object.value)) {
      nodo(s);
      nodo(t.object.value);
      aristas.push({
        id: idArista(s, t.predicate.value, t.object.value),
        desde: s,
        predicado: t.predicate.value,
        hasta: t.object.value,
      });
    }
  }
  // Los literales de un sujeto que no es nodo (la metadata de los grafos nombrados: urn:kiri-repos:…) no se dibujan.
  for (const t of literales) {
    nodos.get(t.subject.value)?.atributos.push({ predicado: t.predicate.value, valor: t.object.value });
  }
  for (const n of nodos.values()) {
    const etiqueta = ETIQUETAS.map((p) => n.atributos.find((a) => a.predicado === p)?.valor).find(Boolean);
    n.etiqueta = etiqueta ?? nombreCorto(n.iri);
  }
  return { nodos, aristas };
}

/** Cuántos nodos hay de cada clase, de más a menos. */
export function conteoPorClase(m: Modelo): { clase: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const n of m.nodos.values()) cuenta.set(n.clase, (cuenta.get(n.clase) ?? 0) + 1);
  return [...cuenta].map(([clase, n]) => ({ clase, n })).sort((a, b) => b.n - a.n || a.clase.localeCompare(b.clase));
}

/** Las componentes conexas (sin mirar la dirección de las aristas), de la más grande a la más chica. */
export function islas(m: Modelo): string[][] {
  const vecinos = new Map<string, string[]>([...m.nodos.keys()].map((k) => [k, []]));
  for (const a of m.aristas) {
    vecinos.get(a.desde)!.push(a.hasta);
    vecinos.get(a.hasta)!.push(a.desde);
  }
  const visto = new Set<string>();
  const salida: string[][] = [];
  for (const inicio of m.nodos.keys()) {
    if (visto.has(inicio)) continue;
    const isla: string[] = [];
    const pila = [inicio];
    visto.add(inicio);
    while (pila.length) {
      const actual = pila.pop()!;
      isla.push(actual);
      for (const v of vecinos.get(actual)!) {
        if (visto.has(v)) continue;
        visto.add(v);
        pila.push(v);
      }
    }
    salida.push(isla);
  }
  return salida.sort((a, b) => b.length - a.length);
}

/** Las islas de más de un nodo, cada una con sus clases (de la más poblada a la menos), y cuántos nodos quedan sueltos. */
export function resumenDeIslas(m: Modelo): { grandes: { nodos: number; clases: string[] }[]; sueltos: number } {
  const todas = islas(m);
  const grandes = todas.filter((i) => i.length > 1).map((isla) => {
    const cuenta = new Map<string, number>();
    for (const iri of isla) {
      const c = m.nodos.get(iri)!.clase;
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    }
    return { nodos: isla.length, clases: [...cuenta].sort((a, b) => b[1] - a[1]).map(([c]) => c) };
  });
  return { grandes, sueltos: todas.length - grandes.length };
}
