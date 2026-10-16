// La página de diagnóstico: la sonda en el hilo de la página y la misma sonda en un worker, lado a lado.
import { sondear } from "./diagnostico-webgpu-sonda.js";

const salida = document.getElementById("salida");
const resultados = { navegador: navigator.userAgent, pagina: "…", worker: "…" };
const pintar = () => (salida.textContent = JSON.stringify(resultados, null, 2));
pintar();

sondear().then((r) => ((resultados.pagina = r), pintar()));

try {
  const w = new Worker("./diagnostico-webgpu-worker.js", { type: "module" });
  w.addEventListener(
    "message",
    (e) => ((resultados.worker = e.data), pintar(), w.terminate()),
  );
  w.addEventListener(
    "error",
    (
      e,
    ) => ((resultados.worker = { error: e.message || "el worker no arrancó" }), pintar()),
  );
} catch (e) {
  resultados.worker = { error: String(e) };
  pintar();
}
