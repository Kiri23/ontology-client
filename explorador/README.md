# API explorer

A Storybook for `@kiri23/ontology-client`: <https://ontology.kiri231.com/explorador/>.

Storybook lists components and lets you try each one with controls. Here the list is the SDK's classes, and each
function is a **story**: its JSDoc, its signature, a form with its parameters, the **Correr** (Run) button and the
response (HTTP status or `ErrorServidor`, time, JSON and, if it is a list of objects, a table). The URL keeps the story
and its values (`#/jobs.get?tecnologia=python`), so a link reproduces the call.

The page itself is in Spanish. Button and view names are quoted here as the page shows them, with the English meaning
the first time.

Everything goes through this repo's SDK (`../mod.ts`), never through a hand-written `fetch`. It is served from the same
origin as the API, so the SDK talks to `window.location.origin` and no CORS is needed.

## What is here

```
explorador/
  src/historias/   the catalog, plain TypeScript (no React): imported by the app and by the coverage test (Deno)
    tipos.ts         Historia, Control, Clase
    jobs.ts          jobs.get, jobs.descartar, jobs.marcarAplicado
    proyectos.ts     validarProyecto
    sparql.ts        sparql.consultar
    motor.ts         configurar (with motorHttp, the only one that runs in the browser) and motorHttp.jobs.get
    cliente.ts       crearCliente: one story for each GET in contrato/openapi.json
    index.ts         CLASES, the order of the sidebar
  src/hooks/       useLlamada (useActionState), useRuta (the hash), useToken (sessionStorage)
  src/componentes/ Barra, PanelHistoria, Controles, CampoToken, Respuesta, Tabla, Json, Prosa
  src/logica/      the hash route and the table cells, no React
  src/grafo/       the Graph view (see below): VistaGrafo, motor.ts, vistas/, componentes/, hooks/ and logica/ (no React)
  src/estilos/     one CSS file per section (base, barra, panel, ficha, recibo, tabla, grafo); each component imports its own
  vite/doc-sdk.ts  Vite plugin: each function's JSDoc and signature, read from the SDK's code
  pruebas/         vitest: stories, hooks and panel with a fake fetch; grafo.test.ts with datos/grafo.ttl (no network)
  docs/            diseno.md (the visual plan) and the AI research (consultas-por-ai.md and the Pixel ones)
  scripts/         humo-imagen (CI) and capturas.mjs (screenshots for a PR)
  Dockerfile       node → Caddy; the build context is the repo root
  Caddyfile        the container's static server
  compose.prod.yaml  the service behind kiri-edge on vps2
```

## Adding a story

When `mod.ts` gains a function, the root test `tests/explorador.test.ts` fails in CI until it has its story. It walks
what the module exports (namespaces included: `jobs.get`, `validarProyecto`…) and compares it **by identity** with each
story's `fn`. It also fails if a story points to something mod.ts does not export, if its `funcion` is not the name of
its `fn`, if two have the same id, if one that writes does not ask for a token, and if a story makes a request that is
not GET without `escribe: true` (or the other way around): it runs them all with a fake fetch and looks at the methods.
The only named exception is `validarProyecto`, which sends the project file by POST but stores nothing.

1. In `src/historias/`, in its class's file (or a new one, added to `CLASES` in `index.ts`), add `historia({ ... })`:
   `id` (goes in the URL), `fn` (the mod.ts function, the reference), `funcion` (its name), `nombre`, `llamada`,
   `controles` and `llamar(fn, valores, { url, fetch, token })`. `llamar` receives that same `fn` with its exact type:
   call that one, not another one you imported.
2. If it writes to the server: `escribe: true` and `token: "acciones"` (or whichever applies). Without a token the
   button stays disabled; with a token, the page shows the values and asks for confirmation before running.
3. The description and the signature come from the function's JSDoc on their own (`vite/doc-sdk.ts`). `nota` adds a line
   of your own and `columnas` says which columns go first if the response is a table.
4. `deno task test` at the root and `npm test` here.

A new GET in the contract needs nothing: `cliente.ts` builds its story from `contrato/openapi.json`.

## Graph

`#/grafo/mapa` and the other entries in the sidebar's Grafo (Graph) section. The whole [RDF](../docs/vocabulary/rdf.md)
graph (about 1 300 triples) is downloaded once with `sparql.consultar("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }")` and
loaded into [oxigraph](https://github.com/oxigraph/oxigraph) 0.5.11, a [SPARQL](../docs/vocabulary/sparql.md) engine in
WASM that runs in the tab. It is drawn with Cytoscape 3.34.3 and the fcose layout. All of that sits behind a lazy
`import()` (`App.tsx`): a story never downloads the WASM (1.4 MB compressed) or the view's chunk (~260 kB compressed).
If that chunk does not arrive (an old tab after a deploy), `SiFalla.tsx` says so and offers to reload. The whole graph
is laid out once, with a fixed seed (`disposicion.ts`): the islands stay in the same place in every view and on reload.

- **Mapa** (Map, `#/grafo/mapa?clase=k:Action`): the instances as nodes (235; literals are attributes, `rdf:type` is the
  color and the shape, the schema is not drawn). The legend counts per class and highlights one. You can see two islands
  that never touch, the job posts and the repos, plus the loose nodes.
- **Indagar** (Explore, `#/grafo/nodo?iri=…&saltos=…&foco=…`; the sidebar goes back to the last one opened): a node's
  card with its relationships grouped by predicate, in both directions. Tapping a relationship adds those neighbors to
  the canvas without moving the ones already there. The path's SPARQL (a CONSTRUCT) is built on its own, with Copiar
  (Copy) and Abrir en consulta libre (Open in free query). The hops go in the URL.
- **Consultas prearmadas** (Prebuilt queries, `#/grafo/huecos`…): they run on open, show the table and highlight their
  nodes.
- **Consulta libre** (Free query, `#/grafo/consulta?sparql=…`): SELECT and ASK give a table or yes/no; CONSTRUCT is
  drawn. A link with `?sparql=` only fills the editor: it runs when you tap Correr (an expensive query would freeze the
  tab when the link opens, and again on reload).

**Adding a prebuilt query:** one more object in `PREARMADAS` (`src/grafo/logica/consultas.ts`) with `id` (goes in the
URL), `nombre`, `pregunta` (one line) and `sparql` (without the PREFIX lines: `declaraciones()` adds the ones it uses).
The sidebar lists it on its own. `pruebas/grafo.test.ts` already runs it against `pruebas/datos/grafo.ttl` and requires
it to pass the validator and return rows; if you know how many, add a test with the number.

**The validator** (`src/grafo/logica/validador.ts`) runs before every free query. It parses with Traqula 1.4.0 (the
successor of sparqljs, which is deprecated) and looks at the algebra. It rejects what does not parse (an undeclared
prefix says which line is missing), what changes data (INSERT, DELETE, LOAD…), what is not SELECT, ASK or CONSTRUCT,
`SERVICE` and `FROM`, and what is expensive (`costo.ts`: patterns with no variables in common, which are a cartesian
product, and a bare `?s ?p ?o`), and the classes (objects of `rdf:type`) and properties that the graph does not have,
with the closest one: "La clase k:Accion no existe en el grafo; parecida: k:Action." (the class k:Accion does not exist
in the graph; closest: k:Action). The known ones come from the Store (used, and declared in the schema). A CONSTRUCT
template can invent predicates; the WHERE cannot. What the AI proposes (Explore with AI, below) goes through here before
it runs.

**The CSP** adds `script-src 'self' 'wasm-unsafe-eval'`: without it the browser does not compile oxigraph's WASM
(`WebAssembly.instantiateStreaming` falls under `default-src 'self'`). `'wasm-unsafe-eval'` only enables WebAssembly,
not JS `eval`, and the WASM is our own asset with a hash. Cytoscape wants to inject a `<style>`, which
`style-src 'self'` blocks: `Lienzo.tsx` takes its id first with a `<meta>`, and its only rule (`position: relative`)
lives in `grafo.css`.

## Explore with AI

In the free query (`#/grafo/consulta`), **Preguntar con AI** (Ask with AI) writes the SPARQL from a question in Spanish.
There are two paths; the state of both lives in `src/grafo/ai/cliente.ts`.

**Through the server, the default.** The button opens the question; **Generar** (Generate) sends `{"mensajes": […]}`
(what `armarMensajes` builds) by `POST /ai/sparql` to the same origin (`src/grafo/ai/servidor.ts`), and ontologyLearning
passes them to Gemma 4 26B-A4B on Google AI Studio, for free (ontologyLearning#31, `vistas/web/ai.py`). It answers
`{"texto": "…"}` in about 2 s. It works in any browser, the Pixel included: it downloads nothing and needs no WebGPU,
and the CSP does not change (`connect-src 'self'`). Opening the view or the question sends nothing: only Generar does.
The question's note says where it goes, and that Google may use what it receives (it is their free service). The server
holds the key, the limit (5 per minute per IP, 10 per minute in total) and a cap of 32 KiB per request. Each error is
told in one sentence:

| The server | The page says (in Spanish)                                                                                                                                                                                                    | Meaning                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 429        | "Se llegó al límite de preguntas por minuto: probá de nuevo en N s." (N es `Retry-After`)                                                                                                                                     | the per-minute question limit was reached: try again in N s (N is `Retry-After`)                                                                                                                                                 |
| 502        | lo que le pasó a Google ("Google no contestó en 30 s.") y "Probá de nuevo en un rato." Sin `{"error"}` (un 502 de Cloudflare o kiri-edge con el origen caído o en deploy): "El servidor no contestó (502)."                   | what happened to Google ("Google did not answer in 30 s") and "try again in a while". Without `{"error"}` (a 502 from Cloudflare or kiri-edge with the origin down or deploying): "the server did not answer (502)"              |
| 503        | el error del servidor; con `Retry-After` (falla pasajera: un 5xx de Google, un timeout) suma "Probá de nuevo en N s", sin él (no hay key, cuota) va solo; sin `{"error"}`, "La AI no está configurada en el servidor todavía" | the server's error; with `Retry-After` (a passing failure: a 5xx from Google, a timeout) it adds "try again in N s", without it (no key, quota) it goes alone; without `{"error"}`, "the AI is not configured on the server yet" |
| 404, 405   | "Este servidor todavía no tiene Preguntar con AI" (un servidor sin #31)                                                                                                                                                       | "this server does not have Ask with AI yet" (a server without #31)                                                                                                                                                               |
| 413, 400   | la pregunta es demasiado larga; el servidor no aceptó la pregunta y por qué                                                                                                                                                   | the question is too long; the server did not accept the question, and why                                                                                                                                                        |
| no network | "No se pudo hablar con el servidor: revisá la conexión y probá de nuevo."                                                                                                                                                     | "could not reach the server: check the connection and try again"                                                                                                                                                                 |

It does not go through the SDK: `/ai/sparql` is not a story in the explorer and is not in `contrato/openapi.json` yet.
`npm run dev` sends it to production, like the other routes.

**On this device, optional.** With WebGPU in core mode, **Preguntar en este dispositivo** (Ask on this device) shows up
too: Gemma 3 270M (`onnx-community/gemma-3-270m-it-ONNX`, `q4f16`, or `q4` without f16, text only with
`Gemma3ForCausalLM` and `AutoTokenizer`) over WebGPU, with Transformers.js 4.3.1 inside a worker
(`src/grafo/ai/worker.ts`). The question never leaves the device. It is the smallest Gemma: Gemma 4 E2B (3.6 GB) does
not fit in the Pixel 10's GPU ([docs/modelo-chico-para-el-pixel.md](docs/modelo-chico-para-el-pixel.md)). With the model
loaded, or if loading fails, **Usar el servidor** (Use the server) releases it and goes back to the other path. How we
got here: `docs/consultas-por-ai.md` and `docs/gemma-en-el-navegador.md`. What follows is about this path, except "It
never runs on its own", which applies to both.

- **What it downloads:** 293 MB the first time with f16 (`onnx/model_q4f16.onnx` and its `.onnx_data`, 273 MB, plus the
  tokenizer, 20 MB), 343 MB without f16 (`model_q4`, 323 MB plus the tokenizer), from Hugging Face. They stay in the
  browser's Cache API (`transformers-cache`, with `navigator.storage.persist()`), and later visits read them from disk.
  Before downloading anything, a notice gives the size and waits for **Continuar** (Continue). Then it shows progress
  per file and compiles the shaders with a test token.
- **On leaving the free query** the worker is terminated and the model leaves memory: on the phone memory is shared, and
  ~300 MB have no reason to stay taken while you read other stories. Coming back loads it again from the Cache API,
  without downloading it (what takes time is creating the sessions, not the download). If the GPU is lost ("device
  lost"), the same happens and the error stays in view.
- **Only WebGPU in core mode.** The device button shows up only if `navigator.gpu.requestAdapter()` gives a core adapter
  in the worker. If it only gives compatibility mode (the only thing Chrome gives on the Pixel 10 Pro XL: the PowerVR
  25.1 driver is on Chromium's WebGPU blocklist), it is not offered: there 270M froze the phone, and in core (with the
  flag that removes the blocklist) it lost the device while generating. We will try again when the driver or the
  blocklist changes ([docs/webgpu-en-el-pixel-10.md](docs/webgpu-en-el-pixel-10.md) §4). Without WebGPU it is not
  offered either, and the server button does not wait for that check. There is no fallback to WASM: the embeddings op
  (`GatherBlockQuantized`) has no CPU kernel in this onnxruntime-web. The embeddings table (84 MB) fits in the Pixel's
  largest buffer (256 MB in compatibility, 128 MB in core); if a GPU accepts less, the download warns that loading may
  fail.
- **It never runs on its own.** The prompt (`src/grafo/ai/prompt.ts`) carries the schema taken from the Store: the
  prefixes, the classes with how many instances they have, and each property with its `rdfs:domain`, `rdfs:range` and
  `rdfs:comment`, or with the classes that use it. Properties with few literals carry their values, as they go in SPARQL
  (`dcterms:source … Valores: "hn", "remotive".`): without that Gemma 4 wrote `"HN"`. They come from `CONSULTA_VALORES`:
  up to 10 distinct, none longer than 40 characters, and only from instances with a class (not each load's provenance).
  It also carries three prebuilt queries as examples, without the PREFIX lines. `extraer.ts` pulls out the
  `` ```sparql `` block and adds the missing PREFIX lines. The query goes to the editor and through the validator. If
  the validator rejects it, it shows the reason and leaves it in the editor to fix. It runs only if you tap Correr.
- **What a visit without AI weighs:** nothing of the model. The Graph view opens a 2 kB worker for the `check`, and only
  if `navigator.gpu` exists. Transformers.js (581 kB) is a separate chunk that the worker imports with `import()` when
  you tap Continuar. The onnxruntime wasm (27 MB, `ort-wasm-simd-threaded.asyncify`) ships as its own asset with a hash
  (`?url`) and is passed to `env.backends.onnx.wasm.wasmPaths`, so it is not downloaded from jsdelivr. This is checked
  by `scripts/chunks-ai.mjs`, which runs on every `npm run build` and exits 1 if the AI gets into the main bundle.
- **The CSP** opens like this, and no more:
  `connect-src 'self' https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX/ https://*.hf.co`. It allows the
  model's path and not the whole host, because huggingface.co's API accepts writes and would be a channel to leak
  tokens. The weights redirect to `us.aws.cdn.hf.co`, and CSP3 does not check the path after a redirect. Also:
  `script-src 'self' 'wasm-unsafe-eval' blob:` (Transformers.js imports the wasm factory as a Blob) and
  `worker-src 'self' blob:`. **Pending:** the reviewer of PR #11 thinks both `blob:` are unnecessary. Without COOP/COEP
  onnxruntime does not create workers, and passing only `wasmPaths.wasm` it would use its embedded factory. They stay
  until the model has run once on the Pixel; then we try removing them. `scripts/humo-imagen` requires all three, and
  also that both wasm files ship as `application/wasm`. The cost is that the page that stores tokens can talk to one
  more origin.

**How to test it.** The server path, in any browser: the PR preview passes `POST /ai/sparql` to production (see below),
so it works once ontologyLearning#31 is deployed; before that, the page says the server does not have it.
`pruebas/ai-servidor.test.tsx` tests it without Google: `servidor.ts` with a fake fetch, the client, and the free query
end to end against a local HTTP server that imitates `/ai/sparql` (question → POST with the prompt → validated query in
the editor; a 429; the server down). `scripts/capturas.mjs` does the same in Chrome with the real CSP.

With the on-device model, only on a device with WebGPU: Chrome on Android 12+ or desktop (where
`navigator.gpu.requestAdapter` gives an adapter, in core or compatibility mode: `public/diagnostico-webgpu.html` tells
you). Open the PR preview at `#/grafo/consulta`, tap Preguntar con AI and then Continuar (under Preguntar en este
dispositivo), wait for the download and ask. **Never in chromium-box or Node**: they have no GPU, and without a GPU the
model does not run (there is no CPU kernel for its embeddings). The rest is covered by tests with a fake worker:
`pruebas/ai.test.ts` (prompt, extractor and client) and `pruebas/ai-vista.test.tsx` (both paths: the device button only
with WebGPU core, the notice comes before the download, and what is generated goes through the validator and does not
run).

## Running it

```sh
npm ci
npm run dev        # http://localhost:5173/explorador/ ; the proxy sends the API routes to production
npm test           # vitest, no network
npm run build      # tsc + vite build → dist/
```

**Careful with `npm run dev`:** the proxy points to `https://ontology.kiri231.com`. An action run from there writes to
production just like one run from the published page.

**In Termux** the repo lives in `/storage`, where there are no symlinks or executable bit, and `node_modules/` cannot be
installed there. Work in a `git worktree` in the native home:

```sh
git -C ~/Code/ontology-client worktree add ~/wt/ontology-client-explorador <rama>
cd ~/wt/ontology-client-explorador/explorador && npm ci
npm test && npm run build
```

The `package.json` scripts call each tool by its path (`node node_modules/vite/bin/vite.js`), not by name: `.bin`
entries with `#!/usr/bin/env` do not run on Android, and plain `vite` exits 127. That way they work the same in Termux,
in CI and in the Dockerfile. A new tool in a script goes the same way, with the `bin` from its `package.json`.

The native bindings (`@rolldown/binding-android-arm64`, `lightningcss-android-arm64`) exist and work; the
`package-lock.json` also has the linux ones for the image. A build takes a couple of seconds.

`deno fmt` and `deno lint` cover this directory. Run them **from the root and with no path**: `deno fmt explorador/`
takes `explorador/package.json` as the root, ignores the `lineWidth: 120` in `deno.json` and reformats everything to 80
columns.

## Tokens

The actions (`jobs.descartar`, `jobs.marcarAplicado`) and `validarProyecto` need a token. You type it on the page; it
lives in the tab's `sessionStorage` (it goes away when you close the tab), it only leaves in the request's
`Authorization` header, and it never goes in the URL, the bundle or a log. The field sits outside the `<form>` and,
where the browser allows it, is masked text instead of `type="password"`, so the password manager does not offer to save
it (details in `CampoToken.tsx`). The Caddyfile sets a CSP that only lets our own JS run and only talks to the same
origin.

## PR preview

Each PR gets its preview on a disposable exe.dev VM: `https://pr-ontology-client-<n>.exe.xyz/` (private, it asks for the
exe.dev login). `.github/workflows/preview.yml` builds it with the `preview-exe-dev` composite action from
Kiri23/kiriInfra: it builds this image, sends it over ssh to the VM and leaves a comment on the PR with the URL and the
commit; closing the PR deletes the VM. Because this repo is public and kiriInfra is private, the workflow downloads the
action with the read-only PAT `KIRIINFRA_READ` and uses it as a local action; it also needs the `EXE_SSH_KEY` secret.
The image runs with `API_UPSTREAM=https://ontology.kiri231.com`: the Caddyfile sends the API's and `/sparql`'s GETs to
the real server, and the root redirects to `/explorador/`. Of the POSTs, only one passes, `POST /ai/sparql` (Preguntar
con AI writes nothing; the limit and the key stay on the server): an action run from the preview does not write to
production. In production the variable does not exist and those blocks do not match; there kiri-edge sends `/ai/sparql`
to ontology-web, not to this container.

## Deploy

`.github/workflows/deploy.yml`, following Kiri23/ontologyLearning's recipe:

- On a PR: builds the node stage, runs `npm test` inside it, builds the final image and runs `scripts/humo-imagen` on it
  (which starts the image and checks the `/explorador` redirect, the index, every asset and font, the CSP with
  `'wasm-unsafe-eval'`, the Graph's wasm as `application/wasm`, the cache, and that it does not run as root).
- On `main`: it also publishes `ghcr.io/kiri23/ontology-explorador` and starts it on vps2 with `compose.prod.yaml`,
  behind kiri-edge. The labels `caddy.reverse_proxy_0: "/explorador …"` and `_1: "/explorador/* …"` are added to the
  `ontology.kiri231.com` site that ontology-web and ontology-grlc set up; the comment in `compose.prod.yaml` explains
  why they do not clash.

Check after the merge:

```sh
curl -sI https://ontology.kiri231.com/explorador | grep -i location      # → /explorador/
curl -s https://ontology.kiri231.com/explorador/ | grep -c 'id="raiz"'   # → 1
```

## Screenshots for a PR

`kiri-pr-shots` and `chromium-shot.py` do not work for a SPA. `scripts/capturas.mjs` makes chromium-box navigate to the
production URL and answers `/explorador/*` with the local `dist/` and the same CSP as the Caddyfile; the real API
answers the GETs and any other method is aborted before it leaves. `POST /ai/sparql` is answered by each screenshot's
fake response (`ai`), and the script exits 1 if a screenshot that does not ask sends it. It exits 1 if the page had any
CSP violation (that is how a `data:` font that the CSP blocked showed up: hence `assetsInlineLimit: 0` in
`vite.config.ts`). The Graph screenshots wait for the canvas to have its canvas element and finish the layout
(`.lienzo[data-listo="true"] canvas`).

```sh
npm run build && node scripts/capturas.mjs ~/tmp/capturas   # 12 screenshots × 390 and 1280 px, 8 of the Graph
kiri-pr-shots subir <pr#> ~/tmp/capturas/*.png
```
