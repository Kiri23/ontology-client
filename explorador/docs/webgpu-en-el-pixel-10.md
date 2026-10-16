# WebGPU en el Pixel 10 Pro XL: solo modo compatibilidad

Medido el 2026-10-16 en el teléfono de Christian: Pixel 10 Pro XL, Chrome 155, GPU PowerVR (`vendor: img-tec`,
`architecture: rogue`). Este doc dice qué da WebGPU ahí, por qué la AI del explorador no arrancaba y qué hace el worker
desde entonces. Lo de Gemma en general está en `gemma-en-el-navegador.md`.

## 1. Qué se midió

| Prueba                                                            | Página    | Worker    |
| ----------------------------------------------------------------- | --------- | --------- |
| `navigator.gpu.requestAdapter()` (modo core)                      | `null`    | `null`    |
| `navigator.gpu.requestAdapter({ featureLevel: "compatibility" })` | adaptador | adaptador |
| `adapter.requestDevice()` (límites por defecto)                   | ok        | ok        |
| Compute shader mínimo (256 `u32`, `datos[i] = i * 2`)             | ok        | ok        |

- **Features del adaptador:** `dual-source-blending`, `float32-blendable`, `texture-component-swizzle`,
  `texture-compression-astc`, `texture-compression-astc-sliced-3d`, `texture-compression-etc2`. **No hay `shader-f16` ni
  `subgroups`.**
- **Límites que importan para el modelo:** `maxBufferSize` 2147483648 (2 GB), `maxStorageBufferBindingSize` 268435456
  (256 MB).
- `chrome://gpu` dice "WebGPU: Hardware accelerated" (`consultas-por-ai.md`, Decisión 6): es cierto, pero no dice que
  sea solo en modo compatibilidad.

Fuentes:

- **webgpureport.org** abierto en el teléfono, exportado como `webgpureport-2026-10-16T13-52-28-306Z.txt` (quedó en
  `/storage/emulated/0/Download/` con extensión `.txt.phps`). El reporte tiene una sola sección, `#1 compatibilityMode`:
  en modo core no hay adaptador que reportar. Los workers dicen `requestAdapter(compat): successful`.
- **`public/diagnostico-webgpu.html`**, la página propia. En el preview del PR:
  `https://pr-ontology-client-11.exe.xyz/explorador/diagnostico-webgpu.html` (en producción, la misma ruta bajo
  `/explorador/`). Corre la misma sonda (`diagnostico-webgpu-sonda.js`) en la página y en un worker y muestra un JSON
  por hilo. Qué leer: `modo` (`"core"`, `"compatibility"` o `null`), `f16`, `subgroups`, `limites`, `device` y `compute`
  (`true` si el shader escribió lo esperado). Si algo tira, sale en `error`.

## 2. Por qué fallaba

Transformers.js y onnxruntime-web piden el adaptador en modo core, sin `featureLevel`. En el Pixel eso da `null`, y el
worker decía "el navegador tiene WebGPU, pero no dio un adaptador".

```console
$ cd explorador
$ grep -o "requestAdapter([^)]*)" node_modules/@huggingface/transformers/dist/transformers.web.js \
    node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs | sort | uniq -c
      1 node_modules/@huggingface/transformers/dist/transformers.web.js:requestAdapter()
      1 node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs:requestAdapter(u)
      1 node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs:requestAdapter({powerPreference:f,forceFallbackAdapter:i})
```

- El de Transformers.js (`isWebGpuFp16Supported`) solo corre con dtype `fp16`; con `q4f16` o `q4` no se usa.
- `requestAdapter({powerPreference,forceFallbackAdapter})` es el de onnxruntime al iniciar su backend de WebGPU
  (`initEp`, en JS). Con `null` tira "Failed to get GPU adapter".
- `requestAdapter(u)` es el del glue de C++ del EP de WebGPU, cuando arma su device. Manda su propio `featureLevel` y
  `powerPreference` (`u={featureLevel:Iu[…],powerPreference:Lu[…],…}`, con `Iu=[,"compatibility","core"]`). Con `null`
  tira "WebGPU not available on this browser (requestAdapter returned null)".

## 3. Qué hace el worker ahora

`src/grafo/ai/worker.ts` y `src/grafo/ai/webgpu.ts`, desde el commit 4a0bce3. La primera versión (6f0752f) creaba el
device ella y se lo pasaba a onnxruntime por `executionProviders`; la revisión del PR mostró dos problemas, y se cambió:

- Con un device propio, los errores no capturados de WebGPU no llegan a onnxruntime: el glue engancha
  `onuncapturederror` solo al device que crea él. Un buffer de más o un OOM quedaban como aviso de consola, y la AI
  decía "listo" con texto vacío.
- `session_options` es uno para todos los archivos del modelo: con `executionProviders` propios,
  `device: { embed_tokens: "wasm" }` no hace nada.

El diseño de ahora:

- **Interceptar `requestAdapter`.** Es lo único que Transformers.js y onnxruntime comparten. `instalarCompatibilidad`
  pone sobre `navigator.gpu` (propiedad propia del objeto, con el original bindeado) una versión que, si core da `null`,
  reintenta con las mismas opciones más `featureLevel: "compatibility"`. Se instala en `load`, antes del `import()` de
  Transformers.js. onnxruntime pide el adaptador por las dos vías de arriba, recibe el de compatibilidad y crea su
  device como siempre: sus features, sus límites y su `onuncapturederror`.
- **`check`:** el mismo `adaptadorWebGpu` (core y después compatibilidad) le dice a la página el `modo`, si hay `f16` y
  el `maxStorageBufferBindingSize`. `load` lee esos datos del adaptador que ya tiene: no pide device.
- **dtype:** `q4f16` con `shader-f16`, `q4` sin él (un shader de f16 no compila en esa GPU). Sin f16 baja 3,6 GB en vez
  de 3,1 (decoder 1 864 MB + embed_tokens 1 763 MB + 19 MB).
- **Embeddings en CPU si la GPU no acepta el buffer.** En `embed_tokens_q4.onnx`, el tensor
  `model_embed_tokens_per_layer_weight_quant` es u8 [262144, 4480] = 1 174 405 120 bytes (1 174 MB), y
  `per_layer_weight_scales` es f32 de 293,6 MB. Los usa `GatherBlockQuantized`, que tiene kernel de WebGPU y ata el
  tensor a un binding; el Pixel acepta 256 MB. El decoder `q4` no pasa del límite (lo más grande es `lm_head`, 201 MB).
  Regla (`opcionesDeCarga` en `protocolo.ts`): si `maxStorageBufferBindingSize` < 1 174 405 120, `device` es
  `{ embed_tokens: "wasm", decoder_model_merged: "webgpu" }`; si no, `"webgpu"`. Vale para los dos dtypes: el tensor
  cuantizado pesa lo mismo en u8. Los tamaños de los tensores salen de la revisión del PR #11, sobre los `.onnx` de
  Hugging Face. Si la regla se queda corta, el error a buscar es `exceeding maxStorageBufferBindingSize of` (está en
  `ort-wasm-simd-threaded.asyncify.wasm`: `grep -ao ".\{60\}exceeding maxStorageBufferBindingSize of.\{30\}"`).
- **Lo que ve la página:** el aviso previo usa `bytesDelModelo(f16)` del check; al empezar `load`, el worker manda la
  `variante` (`dtype`, `bytes`, `embedEnCpu`), y la descarga muestra ese tamaño y, si corresponde, "Los embeddings
  corren en CPU: la GPU no acepta buffers tan grandes."
- **Errores:** lo que nadie atrapa en el worker (`unhandledrejection`, `error`) va a la página como `error`. Un error de
  carga termina el worker: onnxruntime queda abortado ahí, y Probar de nuevo abre uno limpio.

**Sin verificar** (necesita el modelo real en el teléfono; no se carga en Node ni en chromium-box, cuelga la VM):

- Que los kernels de onnxruntime para Gemma compilen y den bien en modo compatibilidad, sin f16 ni subgroups.
- Memoria: al crear las sesiones, onnxruntime tiene los ~3,6 GB de pesos en ArrayBuffers, más lo que sube a la GPU
  (memoria compartida en el teléfono), más los embeddings en el heap de wasm.
- Velocidad: `q4` hace las cuentas en f32, más lento que `q4f16`, y los embeddings por CPU suman una ida y vuelta por
  token.

## 4. Referencias

- gpuweb, propuesta de modo compatibilidad:
  <https://github.com/gpuweb/gpuweb/blob/main/proposals/compatibility-mode.md>.
- playcanvas/engine#8874: Chrome expone WebGPU en el PowerVR del Pixel 10, con fallas.
- microsoft/onnxruntime#26107: `env.webgpu.device` no se respeta en este build; la primera versión pasaba el device por
  el execution provider.
