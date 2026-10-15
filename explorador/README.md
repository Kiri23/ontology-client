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
    cliente.ts       crearCliente: una historia por cada GET de contrato/openapi.json
    index.ts         CLASES, el orden de la barra
  src/hooks/       useLlamada (useActionState), useRuta (el hash), useToken (sessionStorage)
  src/componentes/ Barra, PanelHistoria, Controles, CampoToken, Respuesta, Tabla, Json, Prosa
  src/logica/      la ruta del hash y las celdas de la tabla, sin React
  vite/doc-sdk.ts  plugin de Vite: el JSDoc y la firma de cada función, leídos del código del SDK
  pruebas/         vitest: historias, hooks y panel con un fetch falso (sin red)
  scripts/         humo-imagen (CI) y capturas.mjs (capturas para un PR)
  Dockerfile       node → Caddy; el contexto es la raíz del repo
  Caddyfile        el servidor estático del contenedor
  compose.prod.yaml  el servicio detrás de kiri-edge en vps2
```

## Agregar una historia

Cuando `mod.ts` gana una función, el test `tests/explorador.test.ts` de la raíz falla en CI hasta que tenga su historia:
lee las funciones que exporta el módulo (`jobs.get`, `validarProyecto`…) y las compara con el campo `funcion` de cada
historia. También falla si una historia apunta a algo que ya no se exporta, si dos tienen el mismo id o si una que
escribe no pide token.

1. En `src/historias/`, en el archivo de su clase (o uno nuevo, sumado a `CLASES` en `index.ts`), agregá un objeto
   `Historia`: `id` (va en la URL), `funcion` (el nombre en mod.ts), `nombre`, `llamada`, `controles` y `correr`, que
   llama al SDK con los valores del formulario y `{ url, fetch, token }` del contexto.
2. Si escribe en el servidor: `escribe: true` y `token: "acciones"` (o el que corresponda). Sin token el botón queda
   deshabilitado; con token, la página pide confirmación antes de correr.
3. La descripción y la firma salen solas del JSDoc de la función (`vite/doc-sdk.ts`). `nota` agrega una línea propia.
4. `deno task test` en la raíz y `npm test` acá.

Un GET nuevo en el contrato no necesita nada: `cliente.ts` arma su historia desde `contrato/openapi.json`.

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
la URL, en el bundle ni en un log. El Caddyfile pone una CSP que solo deja correr el JS propio y hablar con el mismo
origen.

## Deploy

`.github/workflows/deploy.yml`, con la receta de Kiri23/ontologyLearning:

- En un PR: construye la etapa de node, corre `npm test` adentro, construye la imagen final y le pasa
  `scripts/humo-imagen` (que levanta la imagen y revisa el redirect de `/explorador`, el index, cada asset y fuente, la
  CSP, el cache y que no corra como root).
- En `main`: además publica `ghcr.io/kiri23/ontology-explorador` y la levanta en vps2 con `compose.prod.yaml`, detrás de
  kiri-edge. El label `caddy.reverse_proxy: "/explorador* {{upstreams 8080}}"` se suma al sitio `ontology.kiri231.com`
  que arman ontology-web y ontology-grlc; el comentario de `compose.prod.yaml` explica por qué no choca.

Verificar después del merge:

```sh
curl -sI https://ontology.kiri231.com/explorador | grep -i location      # → /explorador/
curl -s https://ontology.kiri231.com/explorador/ | grep -c 'id="raiz"'   # → 1
```

## Capturas para un PR

`kiri-pr-shots` y `chromium-shot.py` no sirven para una SPA. `scripts/capturas.mjs` hace que chromium-box navegue a la
URL de producción y contesta `/explorador/*` con el `dist/` local; la API real responde los GET y cualquier otro método
se aborta antes de salir.

```sh
npm run build && node scripts/capturas.mjs ~/tmp/capturas   # 3 historias × 390 y 1280 px
kiri-pr-shots subir <pr#> ~/tmp/capturas/*.png
```
