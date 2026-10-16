# Explorador: Gemma 4 E2B gratis en el navegador, como en DocsifyTemplate — verificación

Verificación del 2026-10-16, agente de sesión (no toqué `~/wt/ontology-client-grafo`). Cada afirmación lleva el comando
que la produjo. Scratch: `$TMPDIR/claude-10417/.../scratchpad/prueba/` (pagina.js, worker.js, correr.mjs, nodo-vm.mjs,
fewshot.json) y `.../scratchpad/validador/validar.mjs`.

## Veredicto

1. **Funciona como lo hizo Christian, pero solo con WebGPU.** El código de DocsifyTemplate carga
   `onnx-community/gemma-4-E2B-it-ONNX` con Transformers.js (`@4` sin fijar → hoy 4.3.1), `q4f16`, `device: 'webgpu'`,
   en un Worker; no tiene fallback y no hay demo publicada (sin GitHub Pages).
2. **Cuánto baja:** 3.4 GB con su clase (`Gemma4ForConditionalGeneration`), 3.1 GB texto solo (`Gemma4ForCausalLM`), 3.6
   GB en `q4`. El catálogo de Docsify dice "~1.3 GB": está mal.
3. **WASM no es plan B:** en chromium-box (Chrome 153 headless, sin WebGPU, 8 GB) E2B `q4` dejó el Chrome en 7.4 GB RSS,
   congeló el renderer y la VM (hubo que `ssh exe.dev restart chromium-box`). No se midió tiempo de respuesta en
   navegador porque nunca llegó a cargar.
4. **Mismos pesos por CPU (Node/onnxruntime-node en la VM, 2 vCPU):** carga 16.5 s, 7.1 tok/s de decode, 40 tokens de
   entrada → 6.6 s; con few-shot (~2 140 tokens) 90–103 s por consulta (el prefill por CPU manda).
5. **Calidad:** zero-shot 0/1 válida (inventó `FROM <clase>` y `WHERE {}`); few-shot 1/1 válida y correcta hasta ahora
   (COUNT de k:Action → 10), las otras dos se estaban generando en la VM al cerrar (comando en 2b). El validador
   (`sparqljs` + IRIs del endpoint) está hecho y probado.
6. **CSP:** `connect-src 'self' https://huggingface.co https://*.hf.co` (en el PR #11 se acotó a
   `https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/`), `script-src 'self' 'wasm-unsafe-eval' blob:`,
   `worker-src 'self' blob:`; el wasm de onnxruntime servido propio. Sin violaciones en el harness.
7. **Pixel 10 Pro XL:** al escribir esto, WebGPU estaba sin medir (PowerVR). Se midió después, el mismo día:
   `chrome://gpu` dice "WebGPU: Hardware accelerated" (`consultas-por-ai.md`, Decisión 6). Pero solo en modo
   compatibilidad y sin f16: ver "Pixel 10 Pro XL, 2026-10-16" al final. Falta correr el modelo ahí.
8. **Node en Termux no corre** (`onnxruntime-node` sin binario android/arm64; `sharp` tampoco).
9. **Qué cambia respecto al doc:** el orden de la Decisión: primero el navegador gratis como botón opcional y solo con
   WebGPU; el proxy pago (HF 402 hoy / OpenRouter) pasa a alternativa. Validador, few-shot y "no vps2" quedan igual.
10. **Pendientes de Christian:** `chrome://gpu` en el Pixel; y aceptar abrir la CSP a `*.hf.co` (o servir los pesos
    propios).

## 1. Cómo lo hizo Christian en DocsifyTemplate

Comandos: `find packages/chat -type f`, `cat packages/chat/core/worker.js`, `cat packages/chat/core/chat-engine.js`,
`sed -n 257,300p packages/chat/adapters/docsify.js`, `sed -n 60,110p packages/docs-engine/src/core/config.js`,
`sed -n 20,60p docs/config.js`, `gh issue view 23 -R Kiri23/DocsifyTemplate`, en `~/Code/DocsifyTemplate`.

- **Archivos:**
  `packages/chat/{index.js, core/worker.js (385 líneas), core/chat-engine.js (247), ui/chat-dom.js (647),
  adapters/docsify.js (605)}`.
  **No hay tests ni README** del paquete (`ls test` → `api-validation`, `no-docsify-demo.html`, `test-export.html`,
  `test-mermaid-svg.html`; `grep -rln chat test` → nada).
- **Librería y versión:** `worker.js:13` importa `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4` — **rango
  mayor sin fijar**; hoy resuelve a 4.3.1
  (`curl -s https://registry.npmjs.org/@huggingface/transformers | jq '."dist-tags"'` → `latest: 4.3.1`, publicada
  2026-10-06; 4.3.0 el 2026-09-16). Para el explorador: fijar `4.3.1` (ya tiene 10 días) o `4.3.0`.
- **Carga:** `AutoProcessor.from_pretrained(id)` +
  `Gemma4ForConditionalGeneration.from_pretrained(id, { dtype: 'q4f16',
  device: 'webgpu', use_external_data_format: true })`
  (`worker.js:139-162`). Clase multimodal: carga **embed_tokens + decoder + vision_encoder + audio_encoder**. Existe
  `Gemma4ForCausalLM` (texto solo: embed_tokens + decoder), que en el dist de 4.3.1 es
  `class extends Gemma4ForConditionalGeneration {}` con `text_only_sessions`
  (`grep -o 'Gemma4ForCausalLM.\{0,120\}' transformers.js`; sesiones en el mapa `MODEL_SESSION_CONFIG`,
  `text_only_sessions: { embed_tokens, decoder_model_merged }`).
- **Device:** `'webgpu'` fijo. **Sin fallback a wasm**: `check()` hace `navigator.gpu.requestAdapter()` y si no hay,
  manda `error` (`worker.js:313-320`). `dtype` `q4f16` (`config.js:36-42`, `docs/config.js:36`).
- **Worker:** sí, `new Worker(new URL('../core/worker.js', import.meta.url), { type: 'module' })`
  (`adapters/docsify.js:275-277`). Warm-up de 1 token tras cargar ("Compiling shaders...", `worker.js:328-349`).
- **Caché:** no configura nada → defaults de Transformers.js: Cache API, `cacheKey 'transformers-cache'`,
  `useBrowserCache: IS_WEB_CACHE_AVAILABLE` (`grep -o 'useBrowserCache[^,;]\{0,40\}' transformers.js`).
- **Tamaño declarado vs real:** el catálogo dice `size: '~1.3 GB'` (`chat-engine.js:33`). Los archivos reales,
  `curl -s "https://huggingface.co/api/models/onnx-community/gemma-4-E2B-it-ONNX/tree/main?recursive=true"`:
  `decoder_model_merged_q4f16.onnx_data` 1 519.7 MB, `embed_tokens_q4f16.onnx_data` 1 590.7 MB, `vision_encoder_q4f16`
  99.2 MB, `audio_encoder_q4f16` 171.3 MB, `tokenizer.json` 19.4 MB. **Con la clase que usa Christian baja ~3.4 GB;
  texto solo (`Gemma4ForCausalLM`), ~3.1 GB.** En `q4` (lo que usaría wasm): 1 864 + 1 763 = 3.6 GB. La variante
  `gemma-4-E2B-it-qat-mobile-ONNX` en `q2f16`: decoder 994.6 + embed 1 296.6 = 2.3 GB.
- **Sitio desplegado: no hay.** `gh api repos/Kiri23/DocsifyTemplate/pages` → 404;
  `gh api repos/Kiri23/DocsifyTemplate
  --jq '{homepage,has_pages}'` → `null, false`; `.github/workflows/`
  (`claude-test.yml`, `docs-pipeline.yml`, `publish.yml`) no despliega a Pages/Netlify/Vercel
  (`grep -rn "pages\|deploy\|netlify\|vercel"` → nada). Último push 2026-04-22. El README dice
  `npm run serve → http://localhost:3000`. **No hay demo pública que probar**; lo que probé es mi página mínima con el
  mismo código de carga (punto 2).
- **Issue #23** (abierto): el diseño "engine/transport" del plugin `@docs-engine/chat`; Gemma 4 por WebGPU +
  EmbeddingGemma 300M. Es visión; el código que existe es el de `packages/chat/`.

## 2. Prueba propia

### 2a. Navegador headless (chromium-box), WASM: no entra

Harness (`scratchpad/prueba/`): `pagina.js` + `worker.js` (el mismo flujo de carga que
`DocsifyTemplate/packages/chat/core/worker.js`, con `@huggingface/transformers@4.3.1` fijada desde jsdelivr, Worker de
módulo, `progress_callback` sumando bytes) y `correr.mjs`, que lo manda al `/function` de browserless por
`ssh chromium-box.exe.xyz` + `curl`, igual que `~/tmp/afk/spike-grafo/navegador.mjs`. La página corre en el origen
`https://example.com` (`page.goto` + `page.setContent`) con la CSP propuesta en `<meta http-equiv>`, y anota cada host
al que sale el navegador.

- **El Chrome headless no tiene WebGPU.** `navigator.gpu` es `undefined` en la página, con y sin
  `launch={"args":["--enable-unsafe-webgpu","--use-angle=swiftshader","--enable-unsafe-swiftshader",…]}`
  (`probe-gpu.json` por `/function`: `{"hasGpu":false,"hw":2,"wasmSimd":true,"adapter":null}`, UA
  `HeadlessChrome/153.0.0.0`). En el Worker `navigator.gpu` existe pero `requestAdapter()` no lo llegué a leer (la
  corrida se colgó antes). Por eso la prueba es con `device: "wasm"`, `dtype: "q4"` (wasm no tiene fp16; `q4` es lo que
  usaría el fallback): decoder 1 864 MB + embed_tokens 1 763 MB = **3.6 GB**.
- **Descarga desde la VM: 64 MB/s** (`curl -r 0-209715199 …/embed_tokens_q4.onnx_data` → `speed 64361799 B/s`, redirige
  a `us.aws.cdn.hf.co`). 3.6 GB ≈ 1 min; no es el cuello de botella.
- **Resultado: el renderer se congela y la VM se queda sin memoria.** Tres corridas:
  1. `Runtime.callFunctionOn timed out` a los 180 s (protocolTimeout de Puppeteer): la página dejó de responder.
  2. Con sondeo a prueba de congelamiento (`Promise.race` de 25 s): `curl --max-time 620` venció sin JSON a los 623 s.
     Mientras tanto, en la VM: `free -m` → `used 7903, free 45`; `ps -eo rss,comm --sort=-rss` → `chrome 7 371 988 kB`.
     El `TIMEOUT: 600000` de browserless **no liberó el Chrome**: 10 min después seguía con 7.35 GB y 45 MB libres,
     `ssh` tardaba más de 60 s. Lo recuperé con `ssh exe.dev restart chromium-box` (`{"status":"restarted"}`); el
     compose tiene `restart: unless-stopped`
     (`grep -n restart ~/Code/KiriInfra/machineProfiles/chromium-box/compose.yaml`) y browserless volvió solo. Lectura:
     onnxruntime-web (1.31.0-dev.20260914, el que trae 4.3.1) carga los `.onnx_data` en ArrayBuffers y los copia al heap
     wasm: un modelo de 3.6 GB pide ~7 GB de RAM en el proceso y, además, el heap de wasm32 topa en 4 GB. **E2B no corre
     por WASM en una máquina de 8 GB**; en el Pixel (16 GB, pero Chrome Android limita el renderer y wasm32 sigue en 4
     GB) hay que asumir lo mismo hasta medirlo. Sin WebGPU no hay plan B para E2B.
- **Lo que sí midió el harness antes del congelamiento:** import de la lib OK
  (`{"tipo":"lib","version":"4.3.1",
  "ort":"1.31.0-dev.20260914-8d85527a0"}` a los 124 ms); hosts tocados:
  `cdn.jsdelivr.net` (lib + wasm de ort), `huggingface.co` (307/302) → `us.aws.cdn.hf.co`. Cero violaciones de la CSP
  propuesta (`securitypolicyviolation` en página y worker, lista vacía).
- Gotcha para el próximo que lo intente: con `page.setRequestInterception(true)` los `fetch` del Worker quedan colgados
  (una corrida pasó, dos no); por eso el harness no intercepta y usa `setContent` sobre `example.com`.

### 2b. Node/CPU en la VM (mismos pesos, onnxruntime-node)

Para medir calidad y velocidad con los mismos pesos sin WebGPU: contenedor `node:22-slim` en chromium-box con
`@huggingface/transformers@4.3.1` (onnxruntime-node 1.30, CPU, 2 vCPU EPYC) y `Gemma4ForCausalLM`, `dtype q4`. Scripts:
`scratchpad/prueba/{nodo-vm.mjs, vm-correr.sh}`; log `scratchpad/prueba/nodo-vm.log`; en la VM `~/gemma-prueba-src/`
(scripts) y `~/gemma-prueba/` (caché del modelo, 3.6 GB, y `node_modules`).

- **Descarga + carga: 16.5 s** (`msCarga: 16548`, `bytes: 3 646 875 537`: `decoder_model_merged_q4.onnx_data` 1 864 102
  912 + `embed_tokens_q4.onnx_data` 1 762 656 256 + tokenizer 19 MB). RSS 2.2 GB al cargar (mmap), 3.8 GB generando
  (`ps -eo rss,comm --sort=-rss` → `node 3 799 224`). Comparar con los 7.4 GB del Chrome en wasm.
- **Zero-shot** ("Escribe una consulta SPARQL que cuente las instancias de <…#Action>. Solo la consulta."): 40 tokens de
  entrada, 39 de salida, primer token 1.09 s, total 6.56 s, **7.13 tok/s**. Salida:
  ```
  SELECT (COUNT(?action) AS?count)
  FROM <https://kiri23.dev/catalogo#Action>
  WHERE {
  }
  ```
  `node validar.mjs nodo-simple.json` → `parsea=true valida=false … FROM`, **0/1**. Confirma lo que dice el doc: sin
  ejemplos no sirve.
- **Few-shot** (`fewshot.json`: esquema RDFS de `grafo.ttl` + 3 consultas de ejemplo, 5 898 caracteres ≈ 1 474 tokens de
  sistema): `[1/3] 2138 tok entrada, 155 tok salida, 90 245 ms`, `[2/3] 2148 tok entrada, 200 tok salida, 102 859 ms`
  (200 = `MAXTOK`: no cerró). La tercera estaba a medias cuando el ssh desde el Pixel se cortó
  (`Read from remote host chromium-box.exe.xyz: Software caused connection abort`, exit 255) y el JSON final con los
  textos no llegó a imprimirse. **Relanzado con `nohup`** en la VM:
  `ssh chromium-box.exe.xyz 'cat
  ~/gemma-prueba-src/fewshot.out'` tiene una línea JSON por respuesta (stderr) y el
  JSON completo al final; para validarlas:
  `scp chromium-box.exe.xyz:~/gemma-prueba-src/fewshot.out . && node validar.mjs <json>`.
- **Qué dice la velocidad:** con few-shot el prefill de ~2 100 tokens por CPU cuesta ~80 s; el decode, ~7 tok/s. Por
  WebGPU en escritorio la model card de LiteRT da prefill 4 853 tok/s y decode 73 tok/s (M4 Max); en el teléfono con
  GPU, menos. Por CPU (lo que tendría el Pixel sin WebGPU, si entrara en memoria) sería del orden de estos 90 s por
  consulta: estimación a partir de 2 vCPU x86, no medición en el teléfono.
- **Limpieza pendiente en la VM** (después de leer `fewshot.out`):
  `ssh chromium-box.exe.xyz 'rm -rf ~/gemma-prueba
  ~/gemma-prueba-src; docker rmi node:22-slim'`. No lo borré para no
  perder la corrida en curso.

### Node en Termux: no corre

Comandos (scratchpad `tjs-node/`): `npm i @huggingface/transformers@4.3.1 --ignore-scripts` →
`notsup Unsupported platform for onnxruntime-node@1.30.0: wanted {"os":"win32,darwin,linux"} (current: {"os":"android"})`.
Con `--force` instala, pero `import("@huggingface/transformers")` falla primero por `sharp`
(`Could not load the "sharp" module using the android-arm64 runtime`) y, puesto `@img/sharp-wasm32`, por
`Cannot find module '../bin/napi-v6/android/arm64/onnxruntime_binding.node'`. Coincide con
`feedback_termux_ml_blockers.md`. No insistí.

## 3. Qué pide en el explorador

**CSP mínima para el camino gratis en el navegador** (hoy:
`default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'`,
`explorador/Caddyfile:21`). Verificado con la CSP de prueba en el harness (sin violaciones):

- `connect-src 'self' https://huggingface.co https://*.hf.co`: `resolve/main/...` contesta 302 a
  `https://us.aws.cdn.hf.co/xet-bridge-us/...` (`curl -sI …/resolve/main/onnx/decoder_model_merged_q4f16.onnx_data`); el
  comodín cubre otras regiones del CDN.
- `script-src 'self' 'wasm-unsafe-eval' blob:` y `worker-src 'self' blob:`: la lib viene empaquetada con Vite
  (`'self'`); onnxruntime-web arma la fábrica del wasm como Blob (`wasmPaths.mjs = wasmFactoryBlob`, grep en el dist) y,
  con hilos, workers `blob:`. El `.wasm` de ort hay que servirlo propio
  (`env.backends.onnx.wasm.wasmPaths =
  '/explorador/ort/'`) para no abrir `cdn.jsdelivr.net`; el dist lo baja de
  `cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_ENV.versions.web}/dist/` por defecto. Ojo: el `.wasm` debe viajar como
  `application/wasm` (H2 del PR ya lo exige para el wasm del Grafo).
- `'wasm-unsafe-eval'` ya está.
- **Caché entre visitas:** Transformers.js guarda cada archivo en la Cache API (`transformers-cache`); 3.1–3.4 GB por
  origen. Chrome permite hasta el 60 % del disco por origen y desaloja por LRU salvo `navigator.storage.persist()`. La
  primera visita baja todo; las siguientes leen de disco, pero igual hay que volver a crear la sesión (copiar los pesos
  a la GPU), que son decenas de segundos.
- **Riesgo en el Pixel 10 Pro XL (PowerVR):** WebGPU con fallas conocidas (PlayCanvas #8874). Si falla, el fallback WASM
  **no es viable** para E2B (2a). Estimación, no medición: aun si entrara en memoria, un decode por CPU de un modelo de
  2.3B efectivos en wasm32 anda a 1–3 tok/s en móvil; una consulta de 60 tokens con 2 500 de prompt serían minutos, no
  segundos. Sigue pendiente lo que pedía el doc: `chrome://gpu` o <https://webgpureport.org> en el teléfono.
- **Seguridad:** la página guarda tokens en sessionStorage; cada origen que entra en `connect-src` es un destino posible
  de exfiltración. Servir los pesos desde `/explorador/modelos/` lo evita, a costa de 3.1 GB en vps2.

## 4. Calidad

- **Validador** (`scratchpad/validador/validar.mjs`, `sparqljs` 3.7.4): parsea, exige `type: query` y `SELECT|ASK`,
  rechaza `SERVICE` y `FROM`, recorre el AST (incluidos `items` de los paths) y compara predicados y objetos de
  `rdf:type` con `SELECT DISTINCT ?p` / `SELECT DISTINCT ?c` del endpoint real; lo que pasa se corre contra `/sparql` y
  se cuentan filas. Batería: 4 casos → `1/4` (pasa el COUNT correcto; caen `k:salario`, `INSERT DATA`, `k:Empresa`),
  cada uno por su regla.
- **Preguntas** (`fewshot.json`), con sus respuestas de referencia corridas a mano contra `/sparql`:
  1. "¿Cuántas acciones hay en el grafo?" → 10.
  2. "¿Qué proyectos públicos tienen al menos un workflow? Dame el proyecto y cuántos workflows tiene." → 1 fila
     (`Kiri23/portfolio`, 2).
  3. "¿Qué puestos de HN piden TypeScript? Dame el puesto, su etiqueta y la empresa." → 30 filas.
- **Resultado:** zero-shot **0/1**. Few-shot, relanzado: **1/1 válida y correcta hasta ahora** (las otras dos seguían
  generándose al cerrar; leerlas con el comando de 2b y pasarlas por `validar.mjs`). La primera, "¿Cuántas acciones hay
  en el grafo?" (`fewshot-parcial.json`): 2 138 tokens de entrada, 155 de salida, primer token a los 56.0 s (prefill),
  3.95 tok/s de decode, 95.3 s total. Salida (recortada):
  `SELECT (COUNT(DISTINCT ?accion) AS
  ?total_acciones) WHERE { ?accion a k:Action . }` →
  `parsea=true valida=true filas=1`, y el valor es 10. Repitió los 6 PREFIX e inventó uno que no usa
  (`rdfs: <http://www.w3.org/2000/11/rdf-schema#>`, el año mal): inofensivo porque no lo usa, pero muestra que los IRIs
  son lo que hay que vigilar. Los tamaños de salida (155 y 200 tokens, el segundo cortado por `max_new_tokens`) sugieren
  que E2B repite los PREFIX completos y se alarga; conviene pedir "sin PREFIX, usa los del esquema" y subir
  `max_new_tokens` a 300. La referencia sigue siendo Build2SPARQL: E4B 60.9 % con 3 ejemplos; E2B debería quedar por
  debajo.
- **Costo por consulta en el navegador (estimado con lo medido):** ~2 100 tokens de prompt. Para que WebGPU en el
  teléfono responda en segundos y no en minutos, el prefill tiene que ir a cientos de tok/s; eso solo lo da la GPU.

## Pixel 10 Pro XL, 2026-10-16

Detalle, comandos y fuentes en [webgpu-en-el-pixel-10.md](webgpu-en-el-pixel-10.md). En corto:

- **Medido** (Chrome 155, PowerVR `img-tec`/`rogue`, con `public/diagnostico-webgpu.html` y webgpureport.org; página y
  worker dan lo mismo): `requestAdapter()` en modo core da `null`; con `{ featureLevel: "compatibility" }` da un
  adaptador, `requestDevice()` anda y un compute shader mínimo escribe bien. Sin `shader-f16` ni `subgroups`.
  `maxBufferSize` 2 GB, `maxStorageBufferBindingSize` 256 MB.
- **Por qué no arrancaba:** Transformers.js y onnxruntime piden el adaptador en modo core.
- **Qué hace el worker ahora:** pide core y, si no da, compatibilidad; crea el device él y se lo pasa a onnxruntime por
  `session_options.executionProviders` (y el adaptador por `env.webgpu.adapter`); sin f16 baja `q4` (3,6 GB) en vez de
  `q4f16` (3,1 GB). Sin probar todavía con el modelo real: si el límite de 256 MB por binding rompe con `embed_tokens`,
  la segunda vuelta es mandar esa tabla a wasm.
