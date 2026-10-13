# @kiri23/ontology-client

El cliente HTTP del validador de fichas `proyecto.ttl` de ontologyLearning: manda una ficha Turtle a `POST /proyectos` y
devuelve si conforma a las reglas, con el reporte de SHACL. Es tres cosas:

- una **librería** TypeScript en JSR (`jsr:@kiri23/ontology-client`),
- un **CLI** que valida archivos y sale 0/1/2,
- una **GitHub Action** que corre el CLI sobre las fichas de un repo y anota en el PR las que no conforman.

El motor y las reglas son privados y viven en el servidor (`https://ontology.kiri231.com`). Este repo tiene solo el
cliente: viaja la ficha, vuelve el reporte.

> **0.x:** la API todavía no es estable. Una versión menor puede romperla: fijá la versión exacta.

## Generado desde el contrato

El cliente no describe el endpoint a mano. El servidor genera su contrato OpenAPI 3.1 desde su registro de comandos
(`GET /openapi.json`); este repo guarda una copia y genera los tipos de ahí:

```
servidor ──GET /openapi.json──▶ contrato/openapi.json ──openapi-typescript──▶ generado/api.ts ──▶ mod.ts
            deno task contrato                         deno task generar
```

```sh
deno task contrato                  # baja el contrato (default https://ontology.kiri231.com/openapi.json)
deno task contrato --url http://localhost:8899/openapi.json   # o ONTOLOGY_CONTRATO_URL
deno task generar                   # reescribe generado/api.ts
deno task generar --check           # falla si generado/ no es lo que sale del contrato (lo corre CI)
```

`contrato/` y `generado/` se commitean juntos y no se editan a mano. Si el servidor cambia el contrato, se refresca, se
regenera, y `deno check` marca lo que dejó de calzar.

**Otros lenguajes.** `contrato/openapi.json` es la fuente para todos; TypeScript es la primera reflexión. Un cliente en
otro lenguaje va en su propia carpeta (`python/`, `go/`…) con su propio generador que lee `../contrato/openapi.json`, su
`generado/` commiteado y su chequeo `--check` en CI. La raíz queda para TypeScript porque JSR y la action la necesitan
ahí.

## Librería

```ts
import { validarProyecto } from "jsr:@kiri23/ontology-client@0.1.0";

const ficha = await Deno.readTextFile("proyectos/mi-proyecto/proyecto.ttl");
const r = await validarProyecto(ficha, { token: Deno.env.get("ONTOLOGY_PROYECTOS_TOKEN")! });

if (!r.ok) console.error(`no se pudo validar (HTTP ${r.status ?? "sin respuesta"}): ${r.error}`);
else if (!r.conforma) console.log(r.reporte);
```

`validarProyecto(turtle, { token, url?, fetch? })` nunca tira; devuelve un `Resultado`:

| Resultado                                | Cuándo                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `{ ok: true, conforma: true, reporte }`  | la ficha pasa las reglas                                             |
| `{ ok: true, conforma: false, reporte }` | no las pasa: es un resultado, no un error (el servidor responde 200) |
| `{ ok: false, status: 400, error }`      | body vacío o Turtle que no parsea                                    |
| `{ ok: false, status: 401, error }`      | falta el token o no es el correcto                                   |
| `{ ok: false, status: 408, error }`      | el body no llegó entero a tiempo                                     |
| `{ ok: false, status: 411, error }`      | falta Content-Length (no pasa con este cliente: nunca va chunked)    |
| `{ ok: false, status: 413, error }`      | la ficha pasa los 256 KiB                                            |
| `{ ok: false, status: 415, error }`      | el body no va como `text/turtle` (no pasa con este cliente)          |
| `{ ok: false, status: 503, error }`      | el servidor no tiene token configurado: falla cerrado                |
| `{ ok: false, status: null, error }`     | no hubo respuesta: red caída, DNS, TLS                               |

`fetch` acepta uno propio (tests, proxies); recibe un `Request`, como en openapi-fetch.

### El cliente tipado, sin envoltorio

`validarProyecto` está hecha encima de [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), y esa librería queda a la
vista: `crearCliente()` devuelve su `Client<paths>` tal cual, con los paths del contrato, para usar middleware o
cualquier otra cosa que `validarProyecto` no previó.

```ts
import { crearCliente } from "jsr:@kiri23/ontology-client@0.1.0";

const cliente = crearCliente({ headers: { Authorization: `Bearer ${token}` } });
cliente.use({ onRequest: ({ request }) => console.log(request.method, request.url) });

const { data, error } = await cliente.POST("/proyectos", {
  body: ficha,
  bodySerializer: (t) => t, // openapi-fetch serializa a JSON por default: la ficha saldría entre comillas
  headers: { "Content-Type": "text/turtle" },
});
```

Los tipos generados también se exportan (`paths`, `components`, `operations`) para usar `createClient<paths>()` de
openapi-fetch directamente.

## CLI

```sh
export ONTOLOGY_PROYECTOS_TOKEN=...
deno run --allow-net --allow-read --allow-env jsr:@kiri23/ontology-client@0.1.0/cli proyectos/*/proyecto.ttl
deno run --allow-net --allow-read --allow-env cli.ts --url http://localhost:8899 proyecto.ttl   # desde el repo
```

- URL: `--url`, o `ONTOLOGY_URL`, o `https://ontology.kiri231.com`.
- Token: solo `ONTOLOGY_PROYECTOS_TOKEN` (por flag quedaría en el historial y en la lista de procesos).
- Exit: **0** todas conforman · **1** alguna no conforma · **2** error de uso, lectura, red o token.
- Con `GITHUB_ACTIONS=true` emite `::error file=<archivo>,title=...::<reporte>` por cada ficha que no conforma o no se
  pudo validar.
- Un 401, un 503 o la red caída cortan en la primera ficha: las demás fallarían igual.

## GitHub Action

En el repo que tiene las fichas:

```yaml
# .github/workflows/fichas.yml
name: Fichas
on:
  pull_request:
    paths: ["**/proyecto.ttl"]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  validar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: Kiri23/ontology-client@v0
        with:
          token: ${{ secrets.ONTOLOGY_PROYECTOS_TOKEN }}
          # archivos: proyectos/*/proyecto.ttl   # opcional; default: git ls-files '*proyecto.ttl'
          # url: https://ontology.kiri231.com    # opcional
```

| Input      | Default                        | Qué es                                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------------------------- |
| `token`    | (requerido)                    | el token del servidor; sin él el paso falla                            |
| `archivos` | `git ls-files '*proyecto.ttl'` | rutas o globs (`**` incluido) separados por espacios o saltos de línea |
| `url`      | `https://ontology.kiri231.com` | la URL base del servidor                                               |

Si no hay ninguna ficha, sale 0 con un aviso. Los inputs pasan al script por variables de entorno, nunca interpolados:
no se puede inyectar shell. La action instala Deno 2.9.5 con `denoland/setup-deno` fijado por SHA y corre el `cli.ts` de
la versión de la action, con su propio `deno.json` y lockfile (`--frozen`), así el `deno.json` del repo que la usa no
interfiere.

`v0` es un tag móvil que apunta al último `v0.x.y`; para fijar, `@v0.1.0` o un SHA.

## Desarrollo

```sh
deno task test        # tests: fetch falso, anotaciones, exit codes del proceso
deno fmt --check && deno lint && deno task generar --check
deno run --allow-net --allow-read tests/servidor-falso.ts --puerto 8787 --token prueba
```

`tests/servidor-falso.ts` imita el contrato sin el motor: una ficha no conforma si trae la línea
`# servidor-falso: no conforma`. CI lo levanta para probar la action con `uses: ./`.

### Publicar

`.github/workflows/publish.yml` publica en JSR por OIDC (sin token) al empujar un tag `v*` o cuando un push a `main`
toca `deno.json`. Para una versión nueva: subir `version` en `deno.json`, mergear, `git tag vX.Y.Z && git push --tags`,
y mover `v0`: `git tag -f v0 vX.Y.Z && git push -f origin v0`.

OIDC exige que el paquete exista en jsr.io y esté vinculado a este repo:

1. Crear el paquete: <https://jsr.io/new?scope=kiri23&package=ontology-client>.
2. En <https://jsr.io/@kiri23/ontology-client/settings>, **GitHub repository** → `Kiri23/ontology-client` → Link.
3. Correr el publish: `gh workflow run publish.yml -R Kiri23/ontology-client`.

## Licencia

MIT
