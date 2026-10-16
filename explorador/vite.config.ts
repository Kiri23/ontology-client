/// <reference types="vitest/config" />
// El explorador se sirve en https://ontology.kiri231.com/explorador/, el mismo origen que la API: el SDK le pide a
// window.location.origin y no hace falta CORS. En desarrollo, el proxy manda las rutas del contrato a producción.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import contrato from "../contrato/openapi.json" with { type: "json" };
import { docSdk } from "./vite/doc-sdk.ts";

// /jobs, /proyectos, /preguntar, /reportes: el primer segmento de cada path del contrato. /sparql no está en el
// contrato (su respuesta no es JSON de una forma fija) y el SDK lo usa en sparql.ts: va a mano.
const rutasApi = [...new Set([...Object.keys(contrato.paths).map((p) => p.split("/")[1]), "sparql"])];
const PRODUCCION = "https://ontology.kiri231.com";

export default defineConfig({
  base: "/explorador/",
  plugins: [react(), docSdk()],
  resolve: {
    // El SDK (../cliente.ts) importa "openapi-fetch" a pelo: Deno lo resuelve con su import map, Vite con la copia
    // de explorador/node_modules (la misma versión que fija deno.lock).
    dedupe: ["openapi-fetch"],
  },
  server: {
    fs: { allow: [".."] },
    proxy: Object.fromEntries(
      [...rutasApi, "openapi.json"].map((r) => [`/${r}`, { target: PRODUCCION, changeOrigin: true }]),
    ),
  },
  // assetsInlineLimit 0: Vite metería como data: las fuentes de menos de 4 KB, y la CSP del Caddyfile (font-src 'self')
  // las bloquea. Todo asset sale como archivo.
  // chunkSizeWarningLimit: el chunk de la vista Grafo (Cytoscape, fcose y Traqula, ~870 kB) se carga perezoso con
  // import(); el WASM de oxigraph sale aparte, como asset con hash (oxigraph/web_bg.wasm?url).
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
  // El worker de la AI (src/grafo/ai/worker.ts) como módulo: así su import() de Transformers.js sale en un chunk
  // aparte, que se baja recién al tocar Continuar.
  worker: { format: "es" },
  test: {
    environment: "happy-dom",
    include: ["pruebas/**/*.test.{ts,tsx}"],
  },
});
