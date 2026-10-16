// El Grafo de las pruebas: oxigraph de verdad con pruebas/datos/grafo.ttl, armado como lo arma motor.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import init, { Store } from "oxigraph/web.js";
import { armarModelo } from "../src/grafo/logica/modelo.ts";
import { CONSULTA_CLASES, CONSULTA_PROPIEDADES } from "../src/grafo/logica/validador.ts";
import type { Grafo } from "../src/grafo/motor.ts";

export async function grafoDePrueba(): Promise<Grafo> {
  await init({ module_or_path: readFileSync(resolve("node_modules/oxigraph/web_bg.wasm")) });
  const store = new Store();
  store.load(readFileSync(resolve("pruebas/datos/grafo.ttl"), "utf8"), { format: "text/turtle" });
  const valores = (q: string, v: string) =>
    new Set((store.query(q) as Map<string, { value: string }>[]).map((f) => f.get(v)!.value));
  return {
    store,
    modelo: armarModelo(store.match(null, null, null, null)),
    conocidas: { clases: valores(CONSULTA_CLASES, "c"), propiedades: valores(CONSULTA_PROPIEDADES, "p") },
  };
}
