// La parte del gusto:nombre-especifico que se chequea con código: ninguna clase exportada por la librería tiene un
// método público `create`, ni estático ni de instancia. `create` no dice qué es su argumento ni si toca el disco; cada
// clase dice el suyo (`withId`, `named`, `inNamespace`).

import { assertEquals } from "@std/assert";
import * as client from "../mod.ts";
import * as cli from "../cli.ts";
import * as graph from "../graph.ts";
import * as model from "../model.ts";
import * as neo4j from "../neo4j.ts";
import * as vocabulary from "../vocabulary.ts";

const ENTRADAS = {
  ".": client,
  "./cli": cli,
  "./graph": graph,
  "./model": model,
  "./neo4j": neo4j,
  "./vocabulary": vocabulary,
};
// create, y los nombres viejos que no tienen homónimo vivo: así un alias no puede volver.
const PROHIBIDOS = new Set(["create", "in", "at", "main", "instancesIn", "closed", "a", "files", "graphs"]);

/** Los nombres de un objeto y de su cadena de prototipos, hasta los de JavaScript. */
function nombres(objeto: object, hasta: object): string[] {
  const vistos: string[] = [];
  for (let o: object | null = objeto; o && o !== hasta; o = Object.getPrototypeOf(o)) {
    vistos.push(...Object.getOwnPropertyNames(o));
  }
  return vistos;
}

/** Una función exportada es una clase si su texto empieza con `class`. */
// deno-lint-ignore ban-types
const esClase = (valor: unknown): valor is Function =>
  typeof valor === "function" && Function.prototype.toString.call(valor).startsWith("class");

Deno.test("ninguna clase exportada tiene un método público create", () => {
  const encontrados: string[] = [];
  let clases = 0;
  for (const [entrada, exportado] of Object.entries(ENTRADAS)) {
    for (const [nombre, valor] of Object.entries(exportado)) {
      if (!esClase(valor)) continue;
      clases++;
      for (const metodo of nombres(valor, Function.prototype)) {
        if (PROHIBIDOS.has(metodo)) encontrados.push(`${entrada} ${nombre}.${metodo} (estático)`);
      }
      for (const metodo of nombres(valor.prototype, Object.prototype)) {
        if (PROHIBIDOS.has(metodo)) encontrados.push(`${entrada} ${nombre}#${metodo}`);
      }
    }
  }
  assertEquals(encontrados, []);
  // Que el test mire algo: Graph, GraphNode, Vocabulary, Domain, Model, Shape y las de mod.ts.
  if (clases < 6) throw new Error(`solo encontró ${clases} clases exportadas`);
});
