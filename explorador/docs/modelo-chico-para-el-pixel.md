# ¿Hay un modelo más chico (u otra vía) para la AI del explorador en el Pixel 10?

Investigación con ojos frescos, 2026-10-16, sin sub-agentes y sin cargar ningún modelo. Los scripts y los archivos
bajados (`onnxinfo.py`, `onnxstream.py`, los `.onnx` chicos, el paquete de LiteRT-LM, `webgpu_blocklist_impl.cc`)
quedaron fuera del repo, en el scratchpad de la sesión.

**Decisión de Christian, el mismo día:** "pongamos Gemma 3, lo más chico que podamos". El explorador usa
`onnx-community/gemma-3-270m-it-ONNX` (`src/grafo/ai/protocolo.ts`); la prueba en el Pixel la hace él con el preview del
PR #11. El resultado de la prueba A (la flag) está en `webgpu-en-el-pixel-10.md` §4.

## Respuesta en 5 líneas

1. **Sí, E2B es el Gemma 4 más chico.** El lineup de Google es E2B, E4B, 12B, 26B-A4B y 31B; 270M y 1B existen solo en
   Gemma 3. La variante `E2B-it-qat-mobile` (q2f16, 2,3 GB) tiene la misma tabla de embeddings de 1 174 MB y exige f16.
2. **Hay modelos chicos que entran en el Pixel por tamaño**: Gemma 3 270M q4 (323 MB, tensor más grande 84 MB), Gemma 3
   1B q4 (859 MB / 151 MB), LFM2 700M y 1.2B, Qwen3.5 0.8B. Ninguno exige f16 en `q4` y todos usan los mismos ops que
   E2B.
3. **Pero el bloqueo del Pixel no es el tamaño, es la GPU.** Hallazgo nuevo: el driver PowerVR del teléfono es `25.1`, y
   la blocklist de WebGPU de Chromium bloquea `PowerVR*25.1*` en Vulkan ("known to have significant issues"). Por eso
   core da `null` y solo queda OpenGL ES en modo compatibilidad, sin f16. Un modelo chico elimina la causa 1 de la
   basura (tabla fuera del binding de 256 MB) pero no la causa 2 (shaders mal compilados en ese driver).
4. **Dos pruebas de 10 minutos en el Pixel, antes de escribir código**: (a) `chrome://flags/#enable-unsafe-webgpu`, que
   desactiva la blocklist: ¿aparece adaptador core con `shader-f16`? (b) una página que cargue Gemma 3 270M q4 y pida
   "hola": si contesta coherente, la culpa era el binding y Gemma 3 1B q4 es el candidato; si basura, es la GPU.
5. **Si (b) da basura: descartar la AI en el Pixel por ahora** hasta que Chrome saque al driver 25.1 de la blocklist o
   Google suba el driver. El PR #11 sigue valiendo para escritorio. Ninguna otra vía (Prompt API, WebNN, MediaPipe,
   LiteRT-LM, WebLLM) corre hoy en Chrome Android del Pixel sin ese mismo WebGPU.

## 1. Lineup de Gemma 4 y los ONNX chicos

Comando: `curl -s "https://huggingface.co/api/models?author=google&search=gemma-4&limit=100" | jq -r '.[].id'` →
`gemma-4-{E2B,E4B,12B,26B-A4B,31B}` (+ variantes `-it`, `-qat-*`, `-assistant`). No hay 270M ni 1B de Gemma 4. Los
chicos: `google/gemma-3-270m-it`, `google/gemma-3-1b-it` (`…search=gemma-3`). ONNX en `onnx-community`
(`…author=onnx-community&search=gemma`): `gemma-3-270m-it-ONNX`, `gemma-3-1b-it-ONNX`, `gemma-3-1b-it-ONNX-GQA`,
`gemma-4-E2B-it-qat-mobile-ONNX`, `gemma-4-E4B-it-qat-mobile-ONNX`.

Tamaños: `curl -s https://huggingface.co/api/models/<repo>/tree/main/onnx | jq '.[]|{path,size}'`. Tensor más grande y
ops: `python3 -I onnxinfo.py <.onnx chico>` (grafo sin pesos) o `onnxstream.py` (streaming con seek, para los que traen
los pesos adentro; se borraron después). Los dos scripts quedaron fuera del repo. Lo que importa para el Pixel: tensor ≤
268 435 456 bytes, sin f16, y `GatherBlockQuantized`/`MatMulNBits` corren en el EP de WebGPU (como en E2B).

| modelo (onnx-community)     | q4 total                                  | tensor más grande (q4)                                 | f16 obligatorio     | evidencia SPARQL/SQL                                                                                                                                                 | vía                                                 |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| gemma-4-E2B-it (hoy)        | 3 646 MB                                  | 1 174 MB embed per-layer (GatherBlockQ)                | no (q4)             | Build2SPARQL mide E4B 60,9 % con 3 ejemplos; E2B sin medir                                                                                                           | Transformers.js                                     |
| gemma-4-E2B-it-qat-mobile   | 2 290 MB q2f16                            | 1 174 MB, misma tabla                                  | **sí** (solo q2f16) | ídem                                                                                                                                                                 | Transformers.js                                     |
| **gemma-3-1b-it**           | **859 MB**                                | **151 MB** embed (GatherBlockQ)                        | no                  | sin SPARQL. HumanEval 41,5 / MBPP 35,2 / IFEval 80,2 (model card). Google tiene un fine-tune text-to-SQL (`litert-community/gemma3-1b-ft-text-to-sql`, sin métricas) | Transformers.js                                     |
| **gemma-3-270m-it**         | **323 MB**                                | **84 MB** embed                                        | no                  | sin SPARQL ni coding en la card; IFEval 51,2. Paper 2024: <1B _fine-tuned_ se acerca a ChatGPT en Text2SPARQL (no few-shot)                                          | Transformers.js                                     |
| LFM2-700M / LFM2-1.2B       | 559 / 850 MB                              | 50 / 67 MB                                             | no                  | ninguna; la card dice "we do not recommend… tasks that require programming skills"                                                                                   | Transformers.js                                     |
| Qwen3.5-0.8B (texto+visión) | 648 MB (dec 485 + embed 163)              | 127 MB                                                 | no                  | ninguna de coding en la card (BFCL 25,3). Arquitectura Gated DeltaNet: 769 `Mul`, 162 `ReduceSum` por grafo                                                          | Transformers.js (`Qwen3_5ForConditionalGeneration`) |
| Qwen3.5-2B                  | 1 535 MB                                  | 254 MB (lm_head y embed, justo)                        | no                  | ídem                                                                                                                                                                 | Transformers.js                                     |
| Qwen3-0.6B / 1.7B           | 919 / 2 147 MB                            | **622 MB f32 embed sin cuantizar** (q4f16: 311 MB f16) | q4f16 sí; q4 no     | base 24 % EM text2sql (distil-labs, vendor); 1.7B 32,9 % BIRD (UniQL)                                                                                                | descartado: embed > 256 MB                          |
| Phi-4-mini                  | 2 765 MB                                  | 307 MB embed                                           | no                  | —                                                                                                                                                                    | descartado: > 256 MB y 2,8 GB                       |
| Qwen2.5-Coder-0.5B / 1.5B   | 776 / 1 915 MB                            | no parseado (pesos adentro)                            | ?                   | —                                                                                                                                                                    | sin parsear                                         |
| SmolLM3                     | solo 3B (`HuggingFaceTB/SmolLM3-3B-ONNX`) | —                                                      | —                   | —                                                                                                                                                                    | muy grande                                          |

Notas:

- Gemma 3 270M/1B q4: ops = `MatMulNBits`, `GroupQueryAttention`, `SimplifiedLayerNormalization`, `GatherBlockQuantized`
  (1), 3 `Cast`. Mismo juego de kernels que el decoder de E2B que ya compiló en el Pixel.
- Transformers.js 4.3.1 trae las cuatro arquitecturas (`grep -c '"gemma3_text"\|"lfm2"\|"qwen3_5"' transformers.web.js`
  → 4 cada una). La card de 270M usa `pipeline(…, { dtype: "fp32" })`; en el explorador iría `Gemma3ForCausalLM` con
  `dtype: "q4"` y `device: "webgpu"`, un solo archivo (sin `embed_tokens` aparte).
- Evidencia de calidad **para este tamaño no hay**. Build2SPARQL no mide nada por debajo de E4B; los ≥4B escriben SPARQL
  sintácticamente válido el 100 %. Lo más cercano: Instruct-to-SPARQL mide Llama3-8B few-shot con 52 % de sintaxis
  válida, y el survey dice que los chicos "overfit to seen query patterns". Con 3 ejemplos y el validador, 1B puede
  servir; 270M es una apuesta.

## 2. Por qué el Pixel da solo compatibilidad: la blocklist

- Driver del teléfono: `strings /vendor/lib64/egl/libGLESv2_powervr.so | grep 25.1` →
  `OpenGL ES 3.2 build
  25.1@6794074`; `getprop ro.hardware.vulkan` → `powervr`; Android 16 (SDK 36), build
  `CP1A.260505.005`.
- Chromium `gpu/config/webgpu_blocklist_impl.cc` (main, `curl …?format=TEXT | base64 -d`, líneas 60-64):
  `// ImgTec driver version 25.1 is known to have significant issues. … "*:*:PowerVR*25.1*"`. Y líneas 127-139:
  Imagination se permite en Vulkan desde Android 16 y en OpenGL ES desde Android 13. La entrada `25.1` bloquea Vulkan (=
  core); OpenGL ES 3.1 es lo que Chrome 146+ expone como modo compatibilidad (Chrome 146 release notes: "Support WebGPU
  compatibility mode on OpenGL ES 3.1"). El historial del archivo pide login (403), así que no sé desde cuándo está.
- Es coherente con lo medido: `requestAdapter()` null, `featureLevel: "compatibility"` da `img-tec`/`rogue`, sin
  `shader-f16` ni `subgroups`, `maxStorageBufferBindingSize` 256 MB, `maxStorageBuffersPerShaderStage` 16
  (`/storage/emulated/0/Download/webgpureport-2026-10-16T13-52-28-306Z.txt.phps`).
- El driver nuevo que Google prometió (Android 16 QPR3, PowerVR 1.634.2906) **también reporta 25.1** (Android Headlines,
  dic 2025). O sea: la blocklist tapa el driver que el Pixel tiene y va a tener un tiempo.
- `chrome://flags/#enable-unsafe-webgpu` desactiva la blocklist (developer.chrome.com, troubleshooting tips). Sirve para
  diagnosticar, no para usuarios.

## 3. Otras vías en el teléfono

| vía                           | estado en Chrome Android / Pixel 10                                                                                                                                                                                                                                                                                                                                                                            | fuente                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Prompt API (Gemini Nano)      | **No.** "Chrome for Android, iOS, and ChromeOS on non-Chromebook Plus devices are not yet supported." Escritorio: Chrome 138+, 22 GB de disco, >4 GB VRAM. En Android existe ML Kit GenAI, pero es para apps nativas, no web.                                                                                                                                                                                  | developer.chrome.com/docs/ai/prompt-api                                                                       |
| WebNN                         | **No.** OT re-habilitado M147-149 "excluding Android due to the implementation's immaturity", pausado el 2026-03-27; en Android solo CPU.                                                                                                                                                                                                                                                                      | blink-dev "Intent to Experiment: WebNN"                                                                       |
| MediaPipe LLM Inference (web) | "Maintenance-only mode", "requires a web browser with WebGPU compatibility"; migrar a LiteRT-LM. Tiene `gemma3-270m-it-q4_0-web.task` (249 MB).                                                                                                                                                                                                                                                                | developers.google.com/edge/mediapipe/…/web_js; `litert-community/gemma-3-270m-it`                             |
| LiteRT-LM Web 0.18.0          | Solo `gemma-4-E2B/E4B-it-web.litertlm` (README "Supported Models"). `createDefaultWebGpuDevice` pide `requestAdapter({powerPreference})` **sin featureLevel** → en el Pixel "No GPU adapter found". `shader-f16`/`subgroups` son opcionales en el JS, pero un análisis tercero dice que sus 153 kernels empiezan con `enable f16` (no lo verifiqué). Issue #2368: E2B corre en un Pixel 9 (Mali), 4 GB de RAM. | `npm pack @litert-lm/core@0.18.0`, `dist/litertlm_web.js`; github.com/abgnydn/litert-capture; LiteRT-LM #2368 |
| WebLLM                        | Tiene variantes sin f16 (`Qwen3-0.6B-q4f32_1`, 1 925 MB VRAM; `gemma3-1b-it` solo q4f16). Pide adaptador core. En Android Adreno falla con `VK_ERROR_DEVICE_LOST` (#836 abierto); PowerVR sin reportes.                                                                                                                                                                                                        | `src/config.ts` de mlc-ai/web-llm; issues #836, #254                                                          |
| Transformers.js / ORT compat  | Cero issues sobre "compatibility mode" en onnxruntime ni Transformers.js (`gh search issues`). Sí hay corrupción numérica del EP WebGPU en otras GPUs: ORT #29807 (Intel Iris Xe, fp32), tjs #1320 (Kokoro en S24, audio corrupto), LiteRT.js #8065 (Adreno 8xx, basura tras la primera corrida). La causa 2 es un patrón conocido.                                                                            | `gh search issues`, `gh issue view`                                                                           |

## 4. Costo/beneficio y las pruebas

- **Prueba A (5 min, cero código): la flag.** En el Pixel, `chrome://flags/#enable-unsafe-webgpu` → relanzar Chrome →
  `/explorador/diagnostico-webgpu.html`. Si `modo` pasa a `core` y `f16` a `true`, la blocklist era el único muro y el
  worker actual bajaría `q4f16`. Si el E2B actual genera bien ahí, el problema es solo el driver; si cuelga, la
  blocklist tenía razón. Bonus: con la flag, `chat.webllm.ai` con `Qwen3-0.6B-q4f32_1` prueba otro runtime sin tocar
  nada.
- **Prueba B (10 min, una página): Gemma 3 270M q4 en compat.** Copiar `diagnostico-webgpu.html` a una página que haga
  `Gemma3ForCausalLM.from_pretrained("onnx-community/gemma-3-270m-it-ONNX", { dtype: "q4", device: "webgpu" })` con el
  mismo `instalarCompatibilidad` y pida "hola, ¿cómo estás?" (max 20 tokens). 323 MB, todos los tensores < 256 MB.
  Coherente → la causa 1 (binding) explicaba la basura y vale pasar a Gemma 3 1B. Basura → es el driver, y ningún tamaño
  lo arregla.
- **Si B pasa: cambio en el explorador, chico.** `MODELO` → `onnx-community/gemma-3-1b-it-ONNX`, clase
  `Gemma3ForCausalLM`, `dtype` siempre `q4` (o `q4f16` con f16), sin `use_external_data_format` ni `embed_tokens`
  aparte, sin aviso de "tabla fuera del binding", CSP a la ruta nueva, `opcionesDeCarga` con los tamaños nuevos. Prompt
  igual (`chat_template` de Gemma 3 es distinto al de Gemma 4: revisar `chat.ts`). Calidad: sin evidencia; E2B ya
  necesitaba los 3 ejemplos y el validador manda. Descarga 859 MB en vez de 3,6 GB, memoria ~1 GB en vez de ~4.
- **Fine-tune de 270M/1B para SPARQL**: es la vía con evidencia (paper 2024, y Google lo hizo con 1B para SQL), pero es
  otro proyecto: dataset de preguntas→SPARQL sobre este grafo, Colab, export a ONNX. No para este PR.
- **Descartar la AI en el Pixel por ahora**: honesto si B da basura. Mientras tanto el botón podría esconderse cuando
  `vendor === "img-tec"` (lo que hace PlayCanvas), en vez de avisar y fallar.

## Lo que no verifiqué

- Que los kernels de ORT compilen bien en compat en este driver con un modelo chico: solo la prueba B lo dice.
- Que LiteRT-LM Web exija f16 en los shaders (dato de un repo tercero).
- Desde cuándo está `PowerVR*25.1*` en la blocklist (gitiles pide login).
- Qwen2.5-Coder: no parseé sus grafos (pesos embebidos de 0,8-1,9 GB).
