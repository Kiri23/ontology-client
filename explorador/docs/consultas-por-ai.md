# Consultas SPARQL por AI en el explorador: qué Gemma 4, dónde y con qué validador

Superado el 2026-10-16: el explorador usa Gemma 3 270M; ver modelo-chico-para-el-pixel.md.

Superado otra vez el mismo día: 270M no corre en el Pixel 10. Ahora el botón va por defecto a `POST /ai/sparql` en el
mismo origen (ontologyLearning#31), que le pasa los mensajes de `armarMensajes` a Gemma 4 26B-A4B en Google AI Studio,
gratis; es el punto 7 de abajo con otro proveedor y sin cobrar. El servidor no arma el prompt ni valida: devuelve el
texto y el navegador lo extrae y lo valida como antes. 270M queda como opción "en este dispositivo" con WebGPU core.
Detalle en el README del explorador, sección "Explore with AI".

Investigación R2, 2026-10-16. Sin código: solo la decisión y sus fuentes. Cada número trae el comando o la URL que lo
produjo.

## Decisión

Reescrita el 2026-10-16 después de verificar la vía gratis: `gemma-en-el-navegador.md` tiene la prueba.

1. **Primero: Gemma 4 E2B en el navegador, por WebGPU, con Transformers.js, como ya lo hizo Christian en
   DocsifyTemplate** (`packages/chat/core/worker.js`:
   `Gemma4ForConditionalGeneration.from_pretrained(
   'onnx-community/gemma-4-E2B-it-ONNX', { dtype: 'q4f16', device: 'webgpu' })`
   en un Worker de módulo). Cuesta $0 y no tiene key: el modelo baja de Hugging Face al navegador y queda en la Cache
   API. Cambios respecto a lo de Docsify: fijar `@huggingface/transformers@4.3.1` (allá es `@4` sin fijar), usar
   `Gemma4ForCausalLM` (texto solo: baja 3.1 GB en vez de 3.4) y empaquetar la lib y el wasm de onnxruntime con Vite en
   vez de jsdelivr.
2. **Es un botón opcional con aviso de tamaño, no el default.** La primera visita baja 3.1 GB (decoder 1 520 MB +
   embed_tokens 1 591 MB + tokenizer 19 MB, `api/models/…/tree/main`), después lee del disco. Solo con WebGPU: si
   `navigator.gpu.requestAdapter()` da null, el botón no aparece. **No hay fallback a WASM**: con `q4` son 3.6 GB que
   onnxruntime-web copia al heap de wasm32 (tope 4 GB); en una máquina de 8 GB el proceso llegó a 7.4 GB y se colgó
   (verificación 2026-10-16, chromium-box).
3. **La CSP se abre así y nada más:**
   `connect-src 'self' https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/ https://*.hf.co` (la ruta del modelo,
   no el host entero: la revisión del PR #11 notó que la API de HF acepta escrituras; los pesos redirigen a
   `us.aws.cdn.hf.co`), `script-src 'self' 'wasm-unsafe-eval' blob:`, `worker-src 'self' blob:`. El `.wasm` de
   onnxruntime se sirve desde el propio origen (`env.backends.onnx.wasm.wasmPaths`), para no sumar jsdelivr. Alternativa
   que no abre nada: servir los pesos desde `/explorador/modelos/` (3.1 GB en vps2).
4. **La AI propone y el validador decide.** Corre en el navegador antes de `/sparql`. El PR del grafo ya trae Traqula
   (`@traqula/parser-sparql-1-1` 1.4.0 en `explorador/package.json`): el validador parsea con eso (o con `sparqljs`
   3.7.4, el que probé) y compara predicados, clases y grafos con la lista que da el endpoint. Rechaza update, SERVICE,
   FROM, IRIs desconocidos, cartesianos y sin LIMIT; detalle en la sección Validador.
5. **Few-shot obligatorio:** el esquema RDFS sacado del grafo más 3 consultas de ejemplo (~1 500 tokens; el prompt
   completo ~2 500). Medido con los mismos pesos por CPU: zero-shot 0/1 válida; few-shot con ~2 100 tokens de prompt
   tarda ~90 s por CPU (la GPU lo baja a segundos). Build2SPARQL da E4B 60.9 % con 3 ejemplos; E2B queda por debajo, y
   por eso el validador es la guarda, no el modelo.
6. **WebGPU en el Pixel 10 Pro XL: solo en modo compatibilidad.** `chrome://gpu` dice "WebGPU: Hardware accelerated"
   (2026-10-16), pero `requestAdapter()` en modo core da `null`; con `featureLevel: "compatibility"` da un adaptador sin
   `shader-f16` y con buffers de 256 MB. El worker cae a compatibilidad y baja `q4`; la tabla de embeddings (1 174 MB)
   no entra en un buffer, así que puede fallar al cargar ([webgpu-en-el-pixel-10.md](webgpu-en-el-pixel-10.md)). El
   modelo todavía no corrió ahí. Si en otro device no hay adaptador en ningún modo, el botón no aparece.
7. **Si algún día quisiera pagar: API externa detrás de un proxy en el mismo origen.** `POST /ai/sparql` en
   ontologyLearning llamando a los Inference Providers de HF (`router.huggingface.co/v1/chat/completions`,
   `google/gemma-4-26B-A4B-it`; la key `HUGGING_FACE` ya existe en Doppler pero hoy contesta
   `402 You have no remaining credits`) u OpenRouter al mismo precio. ~$0.00027 por consulta, no toca la CSP, responde
   en segundos y usa un modelo mejor (LiveCodeBench 77 % contra 44 % de E2B). Es alternativa, no plan.
8. **No:** Gemma en vps2 por CPU (2 vCPU, 7.9 GB, ya se colgó por RAM). Tampoco Node con Transformers.js en Termux:
   `onnxruntime-node` no tiene binario para android/arm64 (verificado con `npm i … --force`).
9. **Este PR (rama `explorador-ai`, apilado sobre `explorador-grafo`):** la historia "Indagar con AI" del explorador
   (Worker, botón, aviso de descarga, prompt con el esquema y tres prearmadas) y la CSP del Caddyfile. El validador ya
   venía en el PR del grafo, con la consulta libre; lo que propone la AI pasa por él. Detalle en el README del
   explorador, sección "Explore with AI".
10. **Qué cambia respecto a la versión anterior de este doc:** el orden. Antes iba primero el proxy pago y el navegador
    quedaba "para después"; Christian no paga y ya tiene el camino gratis hecho en DocsifyTemplate. Lo que sigue igual:
    el validador, el few-shot y el no a vps2.

## Qué existe hoy (inventario)

- **Endpoint público `/sparql`, rdflib 7.6, 1 279 tripletas.**
  `curl -s -G https://ontology.kiri231.com/sparql --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE {?s ?p ?o}' -H 'Accept: application/sparql-results+json'`
  → `1279`. El comentario de rdflib 7.6 está en `~/Code/ontologyLearning/consultas/jobs.rq`.
- **Clases con instancias:** JobPost 131, Uso 43, Workflow 21, Technology 15, doap:Project 15, Action 10, más
  rdf:Property y rdfs:Class. Hay 21 predicados distintos. Comando:
  `SELECT ?c (COUNT(?s) AS ?n) WHERE {?s a ?c} GROUP BY ?c` y `SELECT ?p (COUNT(*) AS ?n) WHERE {?s ?p ?o} GROUP BY ?p`,
  contra el mismo endpoint.
- **Tres grafos con nombre:** `urn:kiri-jobs:hn:…`, `urn:kiri-jobs:remotive:…` y `urn:kiri-repos:workflows`. Comando:
  `SELECT DISTINCT ?g WHERE { GRAPH ?g {?s ?p ?o} }`.
- **El esquema ya está dentro del grafo:** `rdfs:domain`, `rdfs:range` y `rdfs:comment` de cada propiedad. El prompt se
  arma con una consulta, sin escribirlo a mano.
- **`/sparql` no sale a la red.** Un audit hook bloquea `SERVICE <url>` y `FROM <url>`
  (`~/Code/ontologyLearning/main.py:43-52`, `sin_red`).
- **`/sparql` no tiene timeout.** `grafo().query(texto)` corre sin límite (`core/preguntas.py:94`,
  `vistas/web.py:73-91`). Con eso queda abierto a consultas caras. Ver la sección Validador.
- **El explorador tiene una CSP estricta.** `connect-src 'self'` (`explorador/Caddyfile`). Los tokens viven en
  sessionStorage (`src/hooks/useToken.ts`).
- **vps2:** 2 vCPU AMD EPYC 9354P (AVX-512), 7.9 GB de RAM, 5.6 GB libres y swap de 4 GB. Comando:
  `ssh vps2 'nproc; lscpu; free -m'`. El 2026-09-23 se colgó por RAM
  (`~/Code/KiriInfra/host-services/vigilante-ram/README.md`).
- **Teléfono:** Pixel 10 Pro XL, Tensor G5, GPU PowerVR, Android 16. Comando:
  `getprop ro.product.model; getprop ro.soc.model; getprop ro.hardware.vulkan`.

## Variantes de Gemma 4 en el hub (hoy)

Comando: `curl -s "https://huggingface.co/api/models?author=google&search=gemma-4&limit=100" | jq -r '.[].id'`

- **Instruct de Google:** `gemma-4-E2B-it`, `gemma-4-E4B-it`, `gemma-4-12B-it`, `gemma-4-26B-A4B-it`, `gemma-4-31B-it`.
  Todas Apache 2.0, sin gate (`curl -s https://huggingface.co/api/models/google/gemma-4-31B-it | jq .gated` → `false`).
- **Builds para navegador:**
  - ONNX para Transformers.js: `onnx-community/gemma-4-E2B-it-ONNX`, `-E4B-it-ONNX` y `-E2B-it-qat-mobile-ONNX`.
  - MLC para WebLLM: `mlc-ai/gemma-4-E2B-it-q4f16_1-MLC`.
  - LiteRT-LM: `litert-community/gemma-4-{E2B,E4B,12B,26B-A4B,31B}-it-litert-lm`.
  - Comando: `curl -s "https://huggingface.co/api/models?author=<org>&search=gemma-4"`.
- **GGUF:** `ggml-org/gemma-4-*-it-GGUF` y `unsloth/…`.

Parámetros (model card de `onnx-community/gemma-4-E2B-it-ONNX`):

- E2B: 2.3B efectivos, 5.1B con embeddings.
- E4B: 4.5B efectivos, 8B con embeddings.
- 26B-A4B: 3.8B activos de 25.2B.
- 31B: denso.

| benchmark (model card) | 31B    | 26B-A4B | E4B    | E2B    |
| ---------------------- | ------ | ------- | ------ | ------ |
| LiveCodeBench v6       | 80.0 % | 77.1 %  | 52.0 % | 44.0 % |
| Tau2 (agentes)         | 76.9 % | 68.2 %  | 42.2 % | 24.5 % |
| MMLU Pro               | 85.2 % | 82.6 %  | 69.4 % | 60.0 % |

## 1. Navegador por WebGPU

**Qué variante corre:** solo E2B y E4B. LiteRT-LM Web soporta solo `gemma-4-E2B-it-web.litertlm` y
`-E4B-it-web.litertlm` (README de `@litert-lm/core@0.18.0`, "Supported Models"). WebLLM trae solo E2B
(`grep gemma-4 src/config.ts` de mlc-ai/web-llm).

**Cuánto pesa la descarga.** Tamaños sacados con
`curl -s "https://huggingface.co/api/models/<repo>/tree/main?recursive=true" | jq '.[]|{path,size}'`:

| runtime                                 | archivo                            | descarga  | memoria                   |
| --------------------------------------- | ---------------------------------- | --------- | ------------------------- |
| LiteRT-LM Web (E2B)                     | `gemma-4-E2B-it-web.litertlm`      | 2 008 MB  | ~1 800 MB de GPU (M4 Max) |
| LiteRT-LM Web (E4B)                     | `gemma-4-E4B-it-web.litertlm`      | 2 969 MB  | —                         |
| MediaPipe LLM Inference (E2B)           | `gemma-4-E2B-it-web.task`          | 2 003 MB  | — (en mantenimiento)      |
| WebLLM (E2B q4f16)                      | 84 shards                          | 2 831 MB  | `vram_required_MB: 3387`  |
| Transformers.js (E2B q4f16, solo texto) | decoder 1 519 + embed_tokens 1 590 | ~3 100 MB | —                         |
| Transformers.js (E2B qat-mobile q2f16)  | decoder 994 + embed 1 296          | ~2 300 MB | —                         |

Más el runtime: LiteRT-LM trae wasm de 22 a 34 MB (`ls -la package/wasm` de `@litert-lm/core@0.18.0`).

**Latencia:**

- La única cifra web medida es de escritorio: LiteRT-LM en una MacBook M4 Max, por WebGPU, prefill a 4 853 tok/s, decode
  a 73 tok/s y TTFT de 1.09 s (model card de `litert-community/gemma-4-E2B-it-litert-lm`, tabla Web).
- No encontré una cifra medida en Chrome de Android. Como referencia, la app nativa en un S26 Ultra con GPU decodifica a
  52 tok/s (misma model card, tabla Android). El navegador del Pixel 10 va a dar menos.
- La primera visita baja 2 GB. Con datos móviles eso descarta el camino como default.

**WebGPU en el Pixel de Christian:**

- Chrome 121 lo activó por defecto en Android 12+ con GPU Qualcomm o ARM:
  <https://developer.chrome.com/blog/new-in-webgpu-121>.
- El Pixel 10 cambió a PowerVR (Imagination). PlayCanvas documenta que Chrome expone WebGPU ahí, pero con fallas:
  inicialización de workgroup memory rota, shaders mal compilados y Dawn suprimiendo fallas del CTS en junio de 2026.
  PlayCanvas cae a WebGL2 en ese GPU: <https://github.com/playcanvas/engine/issues/8874>.
- No lo pude medir. `kiri-adb-conectar` → `adb: device offline`, porque la depuración inalámbrica está apagada.
- **Necesita a Christian:** abrir `chrome://gpu` o <https://webgpureport.org> en el Pixel, o prender la depuración
  inalámbrica para que `kiri-ojos --eval` lea `navigator.gpu.requestAdapter()`.

**Qué pide la CSP** (hoy: `default-src 'self'; connect-src 'self'`):

- **`connect-src`:** `https://huggingface.co https://*.hf.co`. El archivo redirige a `us.aws.cdn.hf.co`
  (`curl -sI https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm`
  → `302`, `location: https://us.aws.cdn.hf.co/xet-bridge-us/…`). La región del CDN puede variar, así que va el comodín.
  - Si los pesos se sirven desde `/explorador/modelos/`, no hace falta. Pero son 2 GB en el disco de vps2 y en el ancho
    de banda.
- **`cdn.jsdelivr.net` (o self-host):**
  - LiteRT-LM busca su wasm por defecto en `https://cdn.jsdelivr.net/npm/@litert-lm/core@0.18.0/wasm`
    (`grep -rhoE 'https://…' dist` del paquete). `loadLiteRtLm(<dir>)` lo apunta a `self` (doc:
    <https://developers.google.com/edge/litert-lm/js>).
  - Transformers.js 4.3.1 baja el wasm de `cdn.jsdelivr.net/npm/onnxruntime-web@…/dist/`
    (`grep -rho 'cdn\.jsdelivr\.net/npm/[^"]*' package/dist/*.js`), salvo que se fije
    `env.backends.onnx.wasm.wasmPaths`. También arma la fábrica wasm como Blob (`wasmPaths.mjs = wasmFactoryBlob`), y
    eso pide `blob:` en `script-src`.
- **`script-src 'self' 'wasm-unsafe-eval'`:** sin eso CSP bloquea `WebAssembly.instantiate`.
- **`worker-src 'self' blob:`:** la inferencia va en un worker para no congelar la UI.
- Es la página que guarda tokens en sessionStorage. Cada origen que se suma a `connect-src` es un destino posible para
  un script inyectado. Ese costo de seguridad es la razón de dejar este camino para después.

**Caché, para no bajar el modelo cada vez:**

- **Transformers.js:** guarda los pesos en la Cache API por defecto (`useBrowserCache: true`,
  `cacheKey: 'transformers-cache'`). `useWasmCache` hace lo mismo con el wasm
  (<https://huggingface.co/docs/transformers.js/api/env>).
- **WebLLM:** usa la Cache API.
- **LiteRT-LM no cachea solo.** No hay `caches.open`, `getDirectory` ni `indexedDB` en su `dist/`
  (`grep -rlE 'caches\.open|getDirectory|indexedDB' dist`). Acepta un `Blob` o un `ReadableStream` (README). Hay que
  bajarlo una vez a OPFS y pasarle el `File`.
- **Cuota:** Chrome da hasta 60 % del disco por origen. `navigator.storage.persist()` evita el desalojo LRU y Chrome no
  muestra ningún diálogo
  (<https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>).

**Runtime recomendado cuando llegue:** LiteRT-LM Web con E2B. Es el archivo más chico (2.0 GB), Google lo mantiene y
MediaPipe LLM Inference está "in maintenance mode" (model card de litert-community). Está en "early preview": 0.18.0
estable, nightlies diarios (`curl -s https://registry.npmjs.org/@litert-lm/core | jq '."dist-tags"'`).

## 2. Servidor propio (vps2, CPU)

**Qué entra en vps2.** Tamaños sacados con
`curl -s "https://huggingface.co/api/models/ggml-org/<repo>/tree/main" | jq …`:

| GGUF         | tamaño    | ¿entra en 5.6 GB libres?                             |
| ------------ | --------- | ---------------------------------------------------- |
| E2B Q4_0     | 2 841 MB  | sí                                                   |
| E4B Q4_0     | 4 590 MB  | justo; sin margen después del cuelgue del 2026-09-23 |
| 12B Q4_0     | 7 219 MB  | no                                                   |
| 26B-A4B Q4_0 | 14 618 MB | no                                                   |
| 31B Q4_0     | —         | no                                                   |

**Tokens/s realistas para E2B:**

- No encontré un benchmark de llama.cpp en un VPS CPU con Gemma 4. Lo más cercano es la model card de LiteRT-LM, con 4
  hilos de CPU:
  - Linux ARM 2.3/2.8 GHz: prefill a 260 tok/s, decode a 35 tok/s.
  - Raspberry Pi 5: prefill a 133 tok/s, decode a 7.6 tok/s.
- vps2 tiene 2 vCPU compartidas. **Estimación** (sin medir): decode de 10 a 20 tok/s y prefill de ~100 tok/s.
  - **Primer pedido:** los ~2 300 tokens de prompt suman unos 20 s de prefill y 300 tokens de salida, otros 15 a 30 s.
  - **Con el prefijo en caché** (`llama-server` reusa el KV del system prompt): la mitad.
- **Medirlo:** `llama-bench -m gemma-4-E2B-it-Q4_0.gguf -t 2 -p 2300 -n 300` en vps2. No lo corrí: son 3 GB en un
  servidor de producción que ya se quedó sin RAM.

**Por qué no:**

- Las 2 vCPU son las de ontology-web, grlc, mycontacts y kiri-edge (`docker stats` en vps2). Un pedido de 30 s las toma
  enteras.
- Además el modelo que entra (E2B) es el más flojo de la familia. Si un día hay GPU o un VPS más grande, se reconsidera.
- Para la CSP daría lo mismo que la opción 3, porque también estaría detrás de `/ai`.

## 3. API externa

Costo por 1M tokens, hoy:

| proveedor              | modelo                             | entrada | salida | por consulta (2 500 + 300) | key      | free tier                                              | fuente                                                                                                                                                         |
| ---------------------- | ---------------------------------- | ------- | ------ | -------------------------- | -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenRouter             | gemma-4-26b-a4b-it                 | $0.0765 | $0.255 | $0.00027                   | sí       | `:free`: 20/min, 50/día (1 000/día con ≥$10 comprados) | `curl -s https://openrouter.ai/api/v1/models \| jq '.data[]\|select(.id\|test("gemma-4"))'`; <https://openrouter.ai/docs/api/reference/limits>                 |
| OpenRouter             | gemma-4-31b-it                     | $0.20   | $0.40  | $0.00062                   | sí       | igual                                                  | ídem                                                                                                                                                           |
| HF Inference Providers | 26B-A4B (deepinfra)                | $0.07   | $0.34  | $0.00028                   | token HF | ninguno para cuentas gratis; PRO $2/mes                | `curl -s https://router.huggingface.co/v1/models \| jq …`; <https://huggingface.co/docs/inference-providers/pricing>                                           |
| HF Inference Providers | 31B (novita)                       | $0.14   | $0.40  | $0.00047                   | token HF | ídem                                                   | ídem                                                                                                                                                           |
| Google AI Studio       | gemma-4-26b-a4b-it, gemma-4-31b-it | gratis  | gratis | $0                         | sí       | límites por proyecto, solo en el panel de AI Studio    | <https://ai.google.dev/gemini-api/docs/pricing> (Gemma 4: "Free of charge"; paid "Not available"); <https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api> |

**Detalles que importan:**

- **AI Studio es gratis, pero es "Unpaid Service".** Google puede usar los prompts para mejorar sus productos y puede
  haber revisores humanos (<https://ai.google.dev/terms>). Acá las preguntas son sobre datos públicos, así que no es
  grave. Los límites no están publicados.
  - **Necesita a Christian:** ver `aistudio.google.com/usage` para Gemma 4.
- **OpenRouter permite poner un límite de crédito por key.** Recomienda hacerlo en cada key y no exponer en el cliente
  una key sin límite (<https://openrouter.ai/docs/api/reference/authentication>).
- **Los tres aceptan CORS desde el navegador:**
  - OpenRouter: `access-control-allow-origin: *`.
  - HF router: `*`.
  - Gemini API: refleja `https://ontology.kiri231.com`.
  - Comando:
    `curl -s -i -X OPTIONS <url> -H 'Origin: https://ontology.kiri231.com' -H 'Access-Control-Request-Method: POST'`.
  - Por eso un modo "traé tu key" es posible sin proxy.

**Dónde va la key:**

- **Proxy en el servidor (primero).**
  - `POST /ai/sparql` en ontology-web, que es la misma imagen Python que ya sirve `/sparql` y `/preguntar`.
  - La key va en Doppler. Encima: límite de crédito en la key ($2–5/mes), rate limit por IP (5/min, por ejemplo) y largo
    máximo de la pregunta.
  - El navegador nunca ve la key y la CSP queda igual.
- **El usuario pega su key (después).** Mismo patrón que `CampoToken` (sessionStorage) y llamada directa a
  `https://openrouter.ai`. Pide sumar ese origen a `connect-src`, el mismo costo de la sección 1, aunque más chico: un
  origen y no tres.

**Latencia:** no hay cifra medida de 26B-A4B en OpenRouter. El endpoint `/endpoints` no trae `latency` ni `throughput`
(`curl -s https://openrouter.ai/api/v1/models/google/gemma-4-26b-a4b-it/endpoints`). La investigación de abril midió una
mediana de 36 tok/s para 31B (Artificial Analysis, en `research_gemma4_ecosystem.md`). Con 300 tokens de salida da ~8 s,
y 26B-A4B debería ser más rápido. Hay que medirlo en el PR.

## 4. Calidad para SPARQL

**Hay evidencia directa con Gemma 4 chica.** Build2SPARQL (2026) evalúa Gemma 4 E4B (`gemma4:e4b`) con el esquema del
dominio en el prompt (<https://arxiv.org/html/2610.00224>). Exact Match F1:

| modelo       | zero-shot | 3-shot recuperado |
| ------------ | --------- | ----------------- |
| Gemma 4 E4B  | 3.8 %     | 60.9 %            |
| Llama 3.1 8B | 0.2 %     | 56.0 %            |
| Qwen 2.5 32B | 20.4 %    | 65.2 %            |

- Todos los modelos escriben SPARQL sintácticamente válido el 100 % de las veces, y E4B ejecuta sin error el 89.4 %.
- **Lección: sin ejemplos no sirve. Con 3 ejemplos parecidos, sí.** Los ejemplos se eligen por similitud de embeddings
  con la pregunta.

**El error típico son los IRIs inventados, no la sintaxis.** PGMR mide que Llama 3.1 8B inventa URIs en el 89 % de las
consultas sin recuperación, y en el 8 % con ella (<https://arxiv.org/pdf/2502.13369>). Por eso el chequeo de IRIs contra
el endpoint es la guarda que importa.

**31B y 26B-A4B no tienen benchmark text-to-SPARQL publicado.** Lo que hay son los benchmarks generales de la model card
(tabla de arriba): en código, 26B-A4B saca 77 % y E4B, 52 %. Es razonable esperar que 26B-A4B quede por encima de los
60.9 % de E4B, pero eso es una inferencia, no una medición.

**Tokens del prompt**, medidos con el tokenizer de `google/gemma-4-E2B-it` (`@huggingface/tokenizers`, script en el
scratchpad):

- Esquema (clases y propiedades con domain, range y comment, sacados de `/sparql`): 2 347 caracteres, **770 tokens**.
- Los 4 `.rq` de `~/Code/ontologyLearning/consultas/` como few-shot: 4 315 caracteres, **1 475 tokens**.
- Con instrucciones, prefijos y la pregunta: **~2 500 tokens de entrada**.
- Entra holgado en la ventana de cualquier variante (128K en E2B y E4B).

Con este grafo chico no hace falta recuperar ejemplos por embeddings: entran los cuatro. Cuando haya más de diez `.rq`,
conviene elegir los 3 más parecidos.

## 5. Validador (diseño)

Es determinista y en TypeScript, con `sparqljs` 3.7.4
(`curl -s https://registry.npmjs.org/sparqljs | jq -r '."dist-tags".latest'`). Las formas del AST las probé con
`node probar.mjs` (en el scratchpad):

- `INSERT DATA` y `LOAD` → `type: "update"`.
- `SERVICE` → patrón `type: "service"`.
- `?x a ontologia:JobPost` → predicado `rdf:type` como `NamedNode`.
- Un camino como `ontologia:pide/…*` → predicado `type: "path"` con `items`.

**Rechaza:**

1. Lo que no parsea. El error del parser vuelve al modelo como pista para un reintento, uno solo.
2. `type === "update"`. Cubre INSERT, DELETE, LOAD, CLEAR, DROP y CREATE de una vez.
3. `queryType` fuera de `SELECT` y `ASK`. La tabla del explorador muestra filas; CONSTRUCT y DESCRIBE quedan para
   después. (Diseño original. El validador del explorador también acepta CONSTRUCT, que la consulta libre dibuja en el
   lienzo, y el prompt de la AI lo permite.)
4. `SERVICE`, en cualquier profundidad, y `FROM` o `FROM NAMED`. El servidor ya los bloquea con `sin_red`; esto los
   frena antes.
5. **IRIs desconocidos.** Recorre todo el árbol (group, optional, union, minus, graph, filter EXISTS, subconsultas y los
   `items` de los paths) y separa los IRIs en tres listas:
   - predicados,
   - objetos de `rdf:type`,
   - nombres de `GRAPH <iri>`.

   Cada lista se compara con su conjunto permitido, que se trae del endpoint al cargar:
   - `SELECT DISTINCT ?p WHERE {?s ?p ?o}`,
   - `SELECT DISTINCT ?c WHERE {?s a ?c}`,
   - `SELECT DISTINCT ?g WHERE {GRAPH ?g {?s ?p ?o}}`.

   El rechazo nombra los IRIs que faltan, para que el reintento los corrija.
6. **Consultas caras.** `/sparql` es rdflib puro y no tiene timeout (`core/preguntas.py:94`), y vps2 tiene 2 vCPU. Con 1
   279 tripletas, un producto cartesiano de tres patrones sueltos son 2·10⁹ filas. Por eso:
   - `LIMIT` obligatorio y ≤ 200. Si falta, se agrega y se avisa.
   - Tope de 15 patrones de tripleta.
   - **Sin componentes desconexos:** se arma el grafo de variables entre patrones y se rechaza el BGP que no es conexo,
     porque es un cartesiano.
   - Nada de `?s ?p ?o` con las tres posiciones libres.

**Avisa sin rechazar:**

- Cero filas al correr: la consulta pasó, pero no encontró nada. Que se vea distinto de un rechazo.
- Las mañas de rdflib 7.6 que ya documenta `jobs.rq`: `GROUP_CONCAT(DISTINCT …)` falla, y hace falta `HAVING BOUND(…)`
  con GROUP BY sin filas.

**Dónde corre:**

- En el navegador, antes del botón Correr. Muestra la consulta propuesta, el veredicto y los motivos.
- En el proxy `/ai/sparql`, que nunca devuelve una consulta rechazada.
- **La guarda real del servidor tiene que ser otra.** El validador del cliente es consejo: cualquiera llama a `/sparql`
  a mano. Falta un timeout en `/sparql`, que es un issue aparte en ontologyLearning y existe con o sin AI.

**Cómo se prueba (la batería del validador):**

- Tienen que pasar: los 4 `.rq` de `consultas/`.
- Tienen que caer, cada uno por su regla: `INSERT DATA`, `LOAD`, `SERVICE`, `FROM <x>`, un `ontologia:salario`
  inventado, una clase `ontologia:Empresa` inventada, `LIMIT 10000`, dos patrones desconexos y `?s ?p ?o` sin anclar.
- Cada mutante cae por la regla que le toca, con el patrón del skill `mutation-battery`.

## Plan por niveles

**Nivel 1, primero.** Dos PRs nuevos, ninguno en `explorador-grafo`:

1. **ontologyLearning:** `POST /ai/sparql`. Toma la pregunta, arma el prompt (esquema sacado de `/sparql`, los 4 `.rq` y
   la pregunta), llama a OpenRouter `google/gemma-4-26b-a4b-it`, valida y devuelve `{consulta, veredicto, motivos}`.
   Lleva rate limit por IP y la key en Doppler. Se suma el timeout de `/sparql` en un issue propio.
2. **ontology-client:** la función del SDK, el validador (TS, `sparqljs`, con su batería) y la historia del explorador.
   La historia trae una caja de pregunta, la consulta propuesta, el veredicto y el botón Correr contra `/sparql`.

Por qué este orden:

- No toca la CSP.
- Cuesta centavos por mes con el tope de la key.
- Responde en segundos.
- Usa el modelo bueno (26B-A4B), no el que entra en el teléfono.

**Nivel 2, después:**

- Botón "correr en este dispositivo" con LiteRT-LM Web y E2B. Es opcional, con aviso de 2 GB, y guarda el modelo en
  OPFS. Antes hay que medir WebGPU en el Pixel 10 (PowerVR) y aceptar abrir la CSP (`*.hf.co`, `'wasm-unsafe-eval'`,
  `worker-src blob:`) o servir los pesos y el wasm desde el mismo origen.
- Modo "traé tu key" de OpenRouter en sessionStorage, que abre `connect-src` a un origen.
- Few-shot por embeddings cuando los `.rq` pasen de diez.
- Gemma en vps2: solo si cambia el hardware.

## Necesita a Christian

- **Probar la AI en el Pixel 10 Pro XL.** WebGPU ahí es solo modo compatibilidad (medido el 2026-10-16;
  [webgpu-en-el-pixel-10.md](webgpu-en-el-pixel-10.md)). El worker ya cae a ese modo, pero el modelo no se puede cargar
  en Node ni en chromium-box: si anda en el teléfono, solo lo dice el teléfono.
- **Nada que pagar.** Los créditos de HF y la key de OpenRouter quedan solo para la alternativa del punto 7.

## Fuentes

- Hub: `curl -s https://huggingface.co/api/models/google/gemma-4-31B-it`, `…/api/models?author=<org>&search=gemma-4`,
  `…/tree/main?recursive=true`.
- <https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX> (model card, benchmarks, PLE).
- <https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm> (tok/s por dispositivo, archivo web, MediaPipe en
  mantenimiento).
- <https://developers.google.com/edge/litert-lm/js>, y `npm pack @litert-lm/core@0.18.0` y
  `@huggingface/transformers@4.3.1` (CDN del wasm y caché).
- <https://huggingface.co/docs/transformers.js/api/env>.
- <https://developer.chrome.com/blog/new-in-webgpu-121>, <https://github.com/playcanvas/engine/issues/8874>.
- <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>.
- <https://openrouter.ai/docs/api/reference/limits>, <https://openrouter.ai/docs/api/reference/authentication>.
- <https://huggingface.co/docs/inference-providers/pricing>.
- <https://ai.google.dev/gemini-api/docs/pricing>, <https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api>,
  <https://ai.google.dev/terms>.
- <https://arxiv.org/html/2610.00224> (Build2SPARQL), <https://arxiv.org/pdf/2502.13369> (PGMR).
- Memorias previas: `~/Code/DocsifyTemplate/.claude/output/research-memories/research_gemma4_ecosystem.md`,
  `research_android_ai_edge.md`, `feedback_termux_ml_blockers.md`, y `gh issue view 23 -R Kiri23/DocsifyTemplate`.
