// Después de `vite build`: la AI no entra en el bundle principal. Una visita que no la usa no baja Transformers.js
// (unos 580 kB) ni el wasm de onnxruntime (27 MB). Sale 1 y dice qué chunk está mal.
//
//   index.js       → no nombra el worker ni Transformers.js
//   VistaGrafo.js  → nombra el worker (new Worker) y no Transformers.js
//   worker.js      → trae Transformers.js con import() y el wasm de onnxruntime servido propio
import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";

const ASSETS = new URL("../dist/assets/", import.meta.url);
const nombres = readdirSync(ASSETS);
const uno = (prefijo) => {
  const hallados = nombres.filter((n) => n.startsWith(prefijo) && n.endsWith(".js"));
  if (hallados.length !== 1) throw new Error(`se esperaba un ${prefijo}*.js en dist/assets y hay ${hallados.length}`);
  return { nombre: hallados[0], texto: readFileSync(new URL(hallados[0], ASSETS), "utf8") };
};

const fallas = [];
try {
  const [index, grafo, worker, lib] = ["index-", "VistaGrafo-", "worker-", "transformers.web-"].map(uno);
  const wasm = nombres.find((n) => /^ort-wasm-simd-threaded\.asyncify-.*\.wasm$/.test(n));
  if (index.texto.includes(worker.nombre) || index.texto.includes(lib.nombre)) {
    fallas.push(`${index.nombre} nombra la AI`);
  }
  if (!grafo.texto.includes(worker.nombre)) fallas.push(`${grafo.nombre} no abre ${worker.nombre}`);
  if (grafo.texto.includes(lib.nombre)) fallas.push(`${grafo.nombre} trae Transformers.js`);
  if (!new RegExp(`import\\([^)]*${lib.nombre.replace(/[.-]/g, "\\$&")}`).test(worker.texto)) {
    fallas.push(`${worker.nombre} no trae ${lib.nombre} con import()`);
  }
  if (!wasm || !worker.texto.includes(wasm)) fallas.push("el worker no apunta al wasm de onnxruntime propio");
} catch (e) {
  fallas.push(e.message);
}
for (const f of fallas) console.error(`chunks-ai: ${f}`);
if (!fallas.length) console.log("chunks-ai: la AI va en chunks aparte (worker y Transformers.js)");
process.exit(fallas.length ? 1 : 0);
