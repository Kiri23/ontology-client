// Las reglas de costo del validador (docs/consultas-por-ai.md §5.6) que importan en un motor local: la consulta corre
// en el hilo de la pestaña y una cara la congela. Con 1 279 tripletas, tres patrones sueltos son 2·10⁹ filas.
// - Sin productos cartesianos: dentro de un grupo de patrones (un BGP, o un join de BGP y paths), todos tienen que
//   quedar unidos por variables en común.
// - Sin un `?s ?p ?o` libre que no tenga otro patrón que lo ancle.
// LIMIT no hace falta acá: el grafo entero ya está en memoria y lo caro es el cartesiano, no cuántas filas salen.
import { compacto } from "./prefijos.ts";

interface Termino {
  termType?: string;
  value?: string;
}

interface Patron {
  type?: string;
  subject?: Termino;
  predicate?: Termino & { type?: string };
  object?: Termino;
  graph?: Termino;
}

const variables = (p: Patron) =>
  [p.subject, p.predicate, p.object, p.graph].filter((t) => t?.termType === "Variable").map((t) => t!.value!);

function texto(t: Termino | undefined): string {
  if (t?.termType === "Variable") return `?${t.value}`;
  if (t?.termType === "NamedNode") return compacto(t.value!);
  if (t?.termType === "Literal") return JSON.stringify(t.value);
  return "(camino)";
}

const escrito = (p: Patron) => `${texto(p.subject)} ${texto(p.predicate)} ${texto(p.object)}`;

/** Los grupos de patrones que el motor junta entre sí: cada BGP, o un join de BGP y paths, como un solo grupo. */
function grupos(algebra: unknown): Patron[][] {
  const salida: Patron[][] = [];
  const visitar = (x: unknown, clave = ""): void => {
    if (!x || typeof x !== "object" || clave === "template") return;
    if (Array.isArray(x)) return x.forEach((y) => visitar(y));
    const nodo = x as { type?: string; patterns?: Patron[]; input?: unknown[] };
    if (nodo.type === "bgp") return void salida.push(nodo.patterns ?? []);
    if (nodo.type === "path") return void salida.push([nodo as Patron]);
    const hojas = nodo.type === "join" && Array.isArray(nodo.input) ? nodo.input as Patron[] : [];
    if (hojas.length && hojas.every((h) => h.type === "bgp" || h.type === "path")) {
      return void salida.push(hojas.flatMap((h) => h.type === "bgp" ? (h as { patterns: Patron[] }).patterns : [h]));
    }
    for (const [k, v] of Object.entries(nodo)) visitar(v, k);
  };
  visitar(algebra);
  return salida;
}

/** Los patrones con variables de un grupo, en componentes unidas por variables en común (el primero de cada una). */
function componentes(patrones: Patron[]): Patron[][] {
  const conVariables = patrones.filter((p) => variables(p).length);
  const raiz = conVariables.map((_, i) => i);
  const buscar = (i: number): number => raiz[i] === i ? i : (raiz[i] = buscar(raiz[i]));
  const duenio = new Map<string, number>();
  conVariables.forEach((p, i) => {
    for (const v of variables(p)) {
      const otro = duenio.get(v);
      if (otro === undefined) duenio.set(v, i);
      else raiz[buscar(i)] = buscar(otro);
    }
  });
  const porRaiz = new Map<number, Patron[]>();
  conVariables.forEach((p, i) => porRaiz.set(buscar(i), [...(porRaiz.get(buscar(i)) ?? []), p]));
  return [...porRaiz.values()];
}

/** Un motivo por cada problema de costo; [] si la consulta es barata. */
export function motivosDeCosto(algebra: unknown): string[] {
  const motivos: string[] = [];
  for (const grupo of grupos(algebra)) {
    const partes = componentes(grupo);
    if (partes.length > 1) {
      motivos.push(
        `Los patrones ${partes.map((c) => escrito(c[0])).join(" y ")} no comparten ninguna variable: juntos son un ` +
          "producto cartesiano (cada resultado de uno con cada resultado del otro) y congelan la pestaña. " +
          "Unilos por una variable en común.",
      );
    } else if (grupo.length === 1 && variables(grupo[0]).length >= 3 && grupo[0].type !== "path") {
      motivos.push(
        `${escrito(grupo[0])} solo, sin otro patrón que lo ancle, recorre el grafo entero. Anclalo con una clase, ` +
          "una propiedad o una IRI (por ejemplo, ?s a k:Action).",
      );
    }
  }
  return motivos;
}
