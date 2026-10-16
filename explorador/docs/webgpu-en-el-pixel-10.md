# WebGPU en el Pixel 10 Pro XL: solo modo compatibilidad

Medido el 2026-10-16 en el teléfono de Christian: Pixel 10 Pro XL, Chrome 155, GPU PowerVR (`vendor: img-tec`,
`architecture: rogue`). Este doc dice qué da WebGPU ahí, por qué la AI del explorador no arrancaba y qué hace el worker
desde entonces. Lo de Gemma en general está en `gemma-en-el-navegador.md`.

## 1. Qué se midió

| Prueba                                                            | Página    | Worker    |
| ----------------------------------------------------------------- | --------- | --------- |
| `navigator.gpu.requestAdapter()` (modo core)                      | `null`    | `null`    |
| `navigator.gpu.requestAdapter({ featureLevel: "compatibility" })` | adaptador | adaptador |
| `adapter.requestDevice()`                                         | ok        | ok        |
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
- `requestAdapter({powerPreference,forceFallbackAdapter})` es el de onnxruntime al iniciar su backend de WebGPU. Lo
  saltea si `env.webgpu.adapter` ya trae uno; si no, con `null` tira "Failed to get GPU adapter".
- `requestAdapter(u)` es el del EP de WebGPU (C++) cuando arma su propio device. Lo saltea si la sesión trae
  `executionProviders: [{ name: "webgpu", device }]` (`webgpuRegisterDevice`). `env.webgpu.device`, en cambio, no se
  respeta en este build (microsoft/onnxruntime#26107).

## 3. Qué hace el worker ahora

`src/grafo/ai/worker.ts`, desde el commit 6f0752f:

- **Adaptador:** pide core; si da `null`, compatibilidad. El `check` le dice a la página el `modo` y si hay `f16`.
- **Device propio:** `adapter.requestDevice()` con todas las features y todos los límites del adaptador (lo mismo que
  pide onnxruntime cuando lo arma él). El adaptador va a `env.backends.onnx.webgpu.adapter`, y el device a
  `session_options.executionProviders` del `from_pretrained`. Transformers.js deja pasar los EP propios: en
  `getSession`, `session_options.executionProviders ??= executionProviders`.
- **dtype:** `q4f16` con `shader-f16`, `q4` sin él (un shader de f16 no compila en esa GPU). Sin f16 baja 3,6 GB en vez
  de 3,1 (decoder 1 864 MB + embed_tokens 1 763 MB + 19 MB). El aviso previo a la descarga muestra el tamaño de la
  variante y, en modo compatibilidad, que es la primera vez que se prueba así.
- **`device.lost`:** manda un error con "device lost"; la página termina el worker y deja cargar de nuevo.

**Sin verificar** (necesita el modelo real en el teléfono; no se carga en Node ni en chromium-box, cuelga la VM):

- Que los kernels de onnxruntime para Gemma compilen y den bien en modo compatibilidad: WGSL sin f16 ni subgroups, y las
  restricciones de compat (menos bindings por stage, sin vistas de textura arbitrarias).
- El límite de 256 MB por binding. `embed_tokens` es una tabla de embeddings de ~1,7 GB en `q4`; si onnxruntime la ata
  entera a un solo binding, la sesión no se crea y el error lo va a decir. La segunda vuelta es mandar `embed_tokens` a
  wasm (`device: { embed_tokens: "wasm", decoder_model_merged: "webgpu" }`), que es un lookup y no necesita GPU.
- Velocidad: `q4` hace las cuentas en f32, más lento que `q4f16`, en un teléfono que ya iba a ser lento.

## 4. Referencias

- gpuweb, propuesta de modo compatibilidad:
  <https://github.com/gpuweb/gpuweb/blob/main/proposals/compatibility-mode.md>.
- playcanvas/engine#8874: Chrome expone WebGPU en el PowerVR del Pixel 10, con fallas.
- microsoft/onnxruntime#26107: `env.webgpu.device` no se respeta; el device va por el execution provider.
