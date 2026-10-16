# Explorador del SDK

Un Storybook de `@kiri23/ontology-client`: <https://ontology.kiri231.com/explorador/>.

Storybook lista componentes y deja probar cada uno con controles. Acá se listan las clases del SDK y cada función es una
**historia**: su JSDoc, su firma, un formulario con sus parámetros, el botón Correr y la respuesta (status HTTP o
`ErrorServidor`, tiempo, JSON y, si es una lista de objetos, una tabla). La URL guarda la historia y sus valores
(`#/jobs.get?tecnologia=python`), así un link reproduce la llamada.

Todo pasa por el SDK de este repo (`../mod.ts`), nunca por un `fetch` a mano. Se sirve en el mismo origen que la API,
así que el SDK le pide a `window.location.origin` y no hace falta CORS.

## Qué hay

```
explorador/
  src/historias/   el catálogo, TypeScript puro (sin React): lo importan la app y el test de cobertura (Deno)
    tipos.ts         Historia, Control, Clase
    jobs.ts          jobs.get, jobs.descartar, jobs.marcarAplicado
    proyectos.ts     validarProyecto
    sparql.ts        sparql.consultar
    cliente.ts       crearCliente: una historia por cada GET de contrato/openapi.json
    index.ts         CLASES, el orden de la barra
  src/hooks/       useLlamada (useActionState), useRuta (el hash), useToken (sessionStorage)
  src/componentes/ Barra, PanelHistoria, Controles, CampoToken, Respuesta, Tabla, Json, Prosa
  src/logica/      la ruta del hash y las celdas de la tabla, sin React
  src/grafo/       la vista Grafo (ver abajo): VistaGrafo, motor.ts, vistas/, componentes/, hooks/ y logica/ (sin React)
  src/estilos/     un CSS por sección (base, barra, panel, ficha, recibo, tabla, grafo); cada componente importa el suyo
  vite/doc-sdk.ts  plugin de Vite: el JSDoc y la firma de cada función, leídos del código del SDK
  pruebas/         vitest: historias, hooks y panel con un fetch falso; grafo.test.ts con datos/grafo.ttl (sin red)
  docs/            diseno.md (el plan visual) y consultas-por-ai.md (la AI que viene)
  scripts/         humo-imagen (CI) y capturas.mjs (capturas para un PR)
  Dockerfile       node → Caddy; el contexto es la raíz del repo
  Caddyfile        el servidor estático del contenedor
  compose.prod.yaml  el servicio detrás de kiri-edge en vps2
```

## Agregar una historia

Cuando `mod.ts` gana una función, el test `tests/explorador.test.ts` de la raíz falla en CI hasta que tenga su historia.
Recorre lo que exporta el módulo (namespaces incluidos: `jobs.get`, `validarProyecto`…) y lo compara **por identidad**
con la `fn` de cada historia. También falla si una historia apunta a algo que mod.ts no exporta, si su `funcion` no es
el nombre de su `fn`, si dos tienen el mismo id, si una que escribe no pide token, y si una historia hace un pedido que
no es GET sin `escribe: true` (o al revés): las corre todas con un fetch falso y mira los métodos. La única excepción
con nombre es `validarProyecto`, que manda la ficha por POST pero no guarda nada.

1. En `src/historias/`, en el archivo de su clase (o uno nuevo, sumado a `CLASES` en `index.ts`), agregá
   `historia({ ... })`: `id` (va en la URL), `fn` (la función de mod.ts, la referencia), `funcion` (su nombre),
   `nombre`, `llamada`, `controles` y `llamar(fn, valores, { url, fetch, token })`. `llamar` recibe la misma `fn` con su
   tipo exacto: llamá a esa, no a otra importada.
2. Si escribe en el servidor: `escribe: true` y `token: "acciones"` (o el que corresponda). Sin token el botón queda
   deshabilitado; con token, la página muestra los valores y pide confirmación antes de correr.
3. La descripción y la firma salen solas del JSDoc de la función (`vite/doc-sdk.ts`). `nota` agrega una línea propia y
   `columnas` dice qué columnas van primero si la respuesta es una tabla.
4. `deno task test` en la raíz y `npm test` acá.

Un GET nuevo en el contrato no necesita nada: `cliente.ts` arma su historia desde `contrato/openapi.json`.

## Grafo

`#/grafo/mapa` y las demás entradas de la sección Grafo de la barra. El grafo RDF entero (unas 1 300 tripletas) se baja
una vez con `sparql.consultar("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }")` y se carga en
[oxigraph](https://github.com/oxigraph/oxigraph) 0.5.11, un motor SPARQL en WASM que corre en la pestaña. Se dibuja con
Cytoscape 3.34.3 y el layout fcose. Todo eso va en un `import()` perezoso (`App.tsx`): una historia no baja el WASM (1,4
MB comprimido) ni el chunk de la vista (~260 kB comprimido). Si ese chunk no llega (una pestaña vieja después de un
deploy), `SiFalla.tsx` lo dice y ofrece recargar. El grafo entero se dispone una vez, con semilla fija
(`disposicion.ts`): las islas quedan en el mismo lugar en todas las vistas y al recargar.

- **Mapa** (`#/grafo/mapa?clase=k:Action`): las instancias como nodos (235; los literales son atributos, `rdf:type` es
  el color y la forma, el esquema no se dibuja). La leyenda cuenta por clase y resalta una. Se ven dos islas que no se
  tocan, los puestos y los repos, más los nodos sueltos.
- **Indagar** (`#/grafo/nodo?iri=…&saltos=…&foco=…`; la barra vuelve al último abierto): la ficha de un nodo con sus
  relaciones agrupadas por predicado, en las dos direcciones. Tocar una relación agrega esos vecinos al lienzo sin mover
  los que ya estaban. El SPARQL del camino (un CONSTRUCT) se arma solo, con Copiar y Abrir en consulta libre. Los saltos
  van en la URL.
- **Consultas prearmadas** (`#/grafo/huecos`…): corren al abrir, muestran la tabla y resaltan sus nodos.
- **Consulta libre** (`#/grafo/consulta?sparql=…`): SELECT y ASK dan tabla o sí/no; CONSTRUCT se dibuja. Un link con
  `?sparql=` solo llena el editor: corre al tocar Correr (una consulta cara congelaría la pestaña al abrir el link, y de
  nuevo al recargar).

**Agregar una consulta prearmada:** un objeto más en `PREARMADAS` (`src/grafo/logica/consultas.ts`) con `id` (va en la
URL), `nombre`, `pregunta` (una línea) y `sparql` (sin los PREFIX: `declaraciones()` agrega los que use). La barra la
lista sola. `pruebas/grafo.test.ts` ya la corre contra `pruebas/datos/grafo.ttl` y exige que pase el validador y dé
filas; si sabés cuántas, sumá un test con el número.

**El validador** (`src/grafo/logica/validador.ts`) corre antes de cada consulta libre. Parsea con Traqula 1.4.0 (el
sucesor de sparqljs, que está deprecado) y mira el álgebra. Rechaza lo que no parsea (un prefijo sin declarar dice qué
línea falta), lo que cambia datos (INSERT, DELETE, LOAD…), lo que no es SELECT, ASK o CONSTRUCT, `SERVICE` y `FROM`, y
lo caro (`costo.ts`: patrones sin variables en común, que son un producto cartesiano, y un `?s ?p ?o` suelto), y las
clases (objetos de `rdf:type`) y propiedades que el grafo no tiene, con la más parecida: "La clase k:Accion no existe en
el grafo; parecida: k:Action.". Las conocidas salen del Store (usadas y declaradas en el esquema). La plantilla de un
CONSTRUCT puede inventar predicados; el WHERE no. Lo que propone la AI (Indagar con AI, abajo) pasa por acá antes de
correr.

**La CSP** suma `script-src 'self' 'wasm-unsafe-eval'`: sin eso el navegador no compila el WASM de oxigraph
(`WebAssembly.instantiateStreaming` cae por `default-src 'self'`). `'wasm-unsafe-eval'` habilita solo WebAssembly, no
`eval` de JS, y el WASM es un asset propio con hash. Cytoscape quiere inyectar un `<style>`, que `style-src 'self'`
bloquea: `Lienzo.tsx` ocupa antes su id con un `<meta>` y su única regla (`position: relative`) vive en `grafo.css`.

## Indagar con AI

En la consulta libre (`#/grafo/consulta`), **Preguntar con AI** escribe el SPARQL a partir de una pregunta en
castellano. El modelo es Gemma 3 270M (`onnx-community/gemma-3-270m-it-ONNX`, `q4f16` o `q4` sin f16, texto solo con
`Gemma3ForCausalLM` y `AutoTokenizer`) y corre en el dispositivo, por WebGPU, con Transformers.js 4.3.1 dentro de un
worker (`src/grafo/ai/worker.ts`). Cuesta $0, no hay key y no hay servidor. Es el Gemma más chico: Gemma 4 E2B (3,6 GB)
no entra en la GPU del Pixel 10 ([docs/modelo-chico-para-el-pixel.md](docs/modelo-chico-para-el-pixel.md)). Cómo se
llegó, con E2B y la receta de DocsifyTemplate: `docs/consultas-por-ai.md` y `docs/gemma-en-el-navegador.md`.

- **Qué baja:** 293 MB la primera vez con f16 (`onnx/model_q4f16.onnx` y su `.onnx_data`, 273 MB, más el tokenizer, 20
  MB), 343 MB sin f16 (`model_q4`, 323 MB más el tokenizer), desde Hugging Face. Quedan en la Cache API del navegador
  (`transformers-cache`, con `navigator.storage.persist()`), y las próximas veces se leen del disco. Antes de bajar
  nada, un aviso dice el tamaño y espera Continuar. Después muestra el progreso por archivo y compila los shaders con un
  token de prueba.
- **Al salir de la consulta libre** el worker se termina y el modelo sale de la memoria: en el teléfono la memoria es
  compartida, y ~300 MB no tienen por qué quedar tomados mientras se leen otras historias. Volver lo carga de nuevo
  desde la Cache API, sin bajarlo (tarda la creación de las sesiones, no la descarga). Si la GPU se pierde ("device
  lost"), pasa lo mismo y el error queda a la vista.
- **Solo WebGPU en modo core.** El botón aparece solo si `navigator.gpu.requestAdapter()` da un adaptador core en el
  worker. Si solo da modo compatibilidad (lo único que da Chrome en el Pixel 10 Pro XL: el driver PowerVR 25.1 está en
  la blocklist de WebGPU de Chromium), una línea dice que está apagado: ahí 270M trabó el teléfono, y en core (con la
  flag que saca la blocklist) perdió el device al generar. Se vuelve a probar cuando cambie el driver o la blocklist
  ([docs/webgpu-en-el-pixel-10.md](docs/webgpu-en-el-pixel-10.md) §4). Sin WebGPU, otra línea lo explica. No hay
  fallback a WASM: el op de los embeddings (`GatherBlockQuantized`) no tiene kernel de CPU en este onnxruntime-web. La
  tabla de embeddings (84 MB) entra en el buffer más grande del Pixel (256 MB en compatibilidad, 128 MB en core); si una
  GPU acepta menos, la descarga avisa que puede fallar al cargar.
- **Nunca corre sola.** El prompt (`src/grafo/ai/prompt.ts`) lleva el esquema sacado del Store: los prefijos, las clases
  con cuántas instancias tienen y cada propiedad con su `rdfs:domain`, `rdfs:range` y `rdfs:comment`, o con las clases
  que la usan. También lleva tres prearmadas como ejemplo, sin las líneas PREFIX. `extraer.ts` saca el bloque
  `` ```sparql `` y agrega los PREFIX que falten. La consulta va al editor y pasa por el validador. Si el validador la
  rechaza, muestra el motivo y la deja en el editor para corregirla. Corre solo si se toca Correr.
- **Cuánto pesa una visita sin AI:** nada de esto. La vista Grafo abre un worker de 2 kB para el `check`, y solo si
  existe `navigator.gpu`. Transformers.js (581 kB) es un chunk aparte que el worker importa con `import()` al tocar
  Continuar. El wasm de onnxruntime (27 MB, `ort-wasm-simd-threaded.asyncify`) sale como asset propio con hash (`?url`)
  y se le pasa a `env.backends.onnx.wasm.wasmPaths`, así no se baja de jsdelivr. Esto lo verifica
  `scripts/chunks-ai.mjs`, que corre en cada `npm run build` y sale 1 si la AI entra en el bundle principal.
- **La CSP** se abre así, y nada más:
  `connect-src 'self' https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX/ https://*.hf.co`. Va la ruta del
  modelo y no el host entero, porque la API de huggingface.co acepta escrituras y sería un canal para sacar tokens. Los
  pesos redirigen a `us.aws.cdn.hf.co`, y CSP3 no mira la ruta después de un redirect. Además:
  `script-src 'self' 'wasm-unsafe-eval' blob:` (Transformers.js importa la fábrica del wasm como Blob) y
  `worker-src 'self' blob:`. **Pendiente:** el revisor del PR #11 cree que los dos `blob:` sobran. Sin COOP/COEP
  onnxruntime no crea workers, y pasando solo `wasmPaths.wasm` usaría su fábrica embebida. Quedan hasta que el modelo
  haya corrido una vez en el Pixel; después se prueba sacarlos. `scripts/humo-imagen` exige las tres, y además que los
  dos wasm salgan como `application/wasm`. El costo es que la página que guarda tokens puede hablar con un origen más.

**Cómo probarlo.** Con el modelo de verdad, solo en un dispositivo con WebGPU: Chrome de Android 12+ o de escritorio
(que `navigator.gpu.requestAdapter` dé un adaptador, en core o en compatibilidad: lo dice
`public/diagnostico-webgpu.html`). Se abre el preview del PR en `#/grafo/consulta`, se toca Preguntar con AI y después
Continuar, se espera la descarga y se pregunta. **Nunca en chromium-box ni en Node**: no tienen GPU, y sin GPU el modelo
no corre (no hay kernel de CPU para sus embeddings). El resto lo cubren los tests con un worker falso:
`pruebas/ai.test.ts` (prompt, extractor y cliente) y `pruebas/ai-vista.test.tsx` (sin WebGPU no hay botón, el aviso va
antes de la descarga, y lo generado pasa por el validador y no corre). La captura `grafo-consulta-sin-webgpu` muestra la
línea sin el botón.

## Correrlo

```sh
npm ci
npm run dev        # http://localhost:5173/explorador/ ; el proxy manda las rutas de la API a producción
npm test           # vitest, sin red
npm run build      # tsc + vite build → dist/
```

**Cuidado con `npm run dev`:** el proxy apunta a `https://ontology.kiri231.com`. Una acción corrida desde ahí escribe en
producción igual que desde la página publicada.

**En Termux** el repo vive en `/storage`, donde no hay symlinks ni bit de ejecución, y `node_modules/` no se puede
instalar ahí. Se trabaja en un `git worktree` en el home nativo:

```sh
git -C ~/Code/ontology-client worktree add ~/wt/ontology-client-explorador <rama>
cd ~/wt/ontology-client-explorador/explorador && npm ci
node node_modules/vitest/vitest.mjs run      # los .bin con #!/usr/bin/env no corren por nombre en Android
node node_modules/vite/bin/vite.js build
```

Los bindings nativos (`@rolldown/binding-android-arm64`, `lightningcss-android-arm64`) existen y funcionan; el
`package-lock.json` trae también los de linux para la imagen. Un build tarda un par de segundos.

`deno fmt` y `deno lint` cubren este directorio. Correlos **desde la raíz y sin ruta**: `deno fmt explorador/` toma
`explorador/package.json` como raíz, ignora el `lineWidth: 120` de `deno.json` y reformatea todo a 80 columnas.

## Tokens

Las acciones (`jobs.descartar`, `jobs.marcarAplicado`) y `validarProyecto` piden token. Se escribe en la página, vive en
el `sessionStorage` de la pestaña (se va al cerrarla), sale solo en el header `Authorization` del pedido y nunca va en
la URL, en el bundle ni en un log. El campo va fuera del `<form>` y, donde el navegador lo permite, es texto enmascarado
en vez de `type="password"`, para que el gestor de contraseñas no ofrezca guardarlo (detalle en `CampoToken.tsx`). El
Caddyfile pone una CSP que solo deja correr el JS propio y hablar con el mismo origen.

## Preview de un PR

Cada PR tiene su preview en una VM desechable de exe.dev: `https://pr-ontology-client-<n>.exe.xyz/` (privada, pide login
de exe.dev). Lo arma `.github/workflows/preview.yml` con el reusable de Kiri23/kiriInfra: construye esta imagen, la
manda por ssh a la VM y deja un comentario en el PR con la URL y el commit; cerrar el PR borra la VM. La imagen corre
con `API_UPSTREAM=https://ontology.kiri231.com`: el Caddyfile manda los GET de la API y de `/sparql` al servidor real y
la raíz redirige a `/explorador/`. Solo GET: una acción corrida desde el preview no escribe en producción. En producción
la variable no existe y ese bloque no matchea.

## Deploy

`.github/workflows/deploy.yml`, con la receta de Kiri23/ontologyLearning:

- En un PR: construye la etapa de node, corre `npm test` adentro, construye la imagen final y le pasa
  `scripts/humo-imagen` (que levanta la imagen y revisa el redirect de `/explorador`, el index, cada asset y fuente, la
  CSP con `'wasm-unsafe-eval'`, el wasm del Grafo como `application/wasm`, el cache y que no corra como root).
- En `main`: además publica `ghcr.io/kiri23/ontology-explorador` y la levanta en vps2 con `compose.prod.yaml`, detrás de
  kiri-edge. Las labels `caddy.reverse_proxy_0: "/explorador …"` y `_1: "/explorador/* …"` se suman al sitio
  `ontology.kiri231.com` que arman ontology-web y ontology-grlc; el comentario de `compose.prod.yaml` explica por qué no
  choca.

Verificar después del merge:

```sh
curl -sI https://ontology.kiri231.com/explorador | grep -i location      # → /explorador/
curl -s https://ontology.kiri231.com/explorador/ | grep -c 'id="raiz"'   # → 1
```

## Capturas para un PR

`kiri-pr-shots` y `chromium-shot.py` no sirven para una SPA. `scripts/capturas.mjs` hace que chromium-box navegue a la
URL de producción y contesta `/explorador/*` con el `dist/` local y la misma CSP del Caddyfile; la API real responde los
GET y cualquier otro método se aborta antes de salir. Sale 1 si la página tuvo alguna violación de CSP (así apareció una
fuente `data:` que la CSP bloqueaba: por eso `assetsInlineLimit: 0` en `vite.config.ts`). Las del Grafo esperan a que el
lienzo tenga su canvas y termine el layout (`.lienzo[data-listo="true"] canvas`).

```sh
npm run build && node scripts/capturas.mjs ~/tmp/capturas   # 10 capturas × 390 y 1280 px, 6 del Grafo
kiri-pr-shots subir <pr#> ~/tmp/capturas/*.png
```
