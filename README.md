# @kiri23/ontology-client

El cliente HTTP de ontologyLearning. Valida fichas `proyecto.ttl` (manda una ficha Turtle a `POST /proyectos` y devuelve
si conforma a las reglas, con el reporte de SHACL), lee los puestos de trabajo (`GET /jobs`, tipados como `JobPost[]`) y
corre acciones sobre ellos (descartar, marcar aplicado). Es tres cosas:

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

Un tipo nace en el servidor como shape SHACL y llega al editor sin que nadie lo escriba: `j:JobPostShape` (TTL) → el
schema `JobPost` de `contrato/openapi.json` → `components["schemas"]["JobPost"]` en `generado/api.ts` → `JobPost` en
`jobs.ts`.

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
import { validarProyecto } from "jsr:@kiri23/ontology-client@0.1.1";

const ficha = await Deno.readTextFile("proyectos/mi-proyecto/proyecto.ttl");
const r = await validarProyecto(ficha, { token: Deno.env.get("ONTOLOGY_PROYECTOS_TOKEN")! });

if (!r.ok) console.error(`no se pudo validar (HTTP ${r.status ?? "sin respuesta"}): ${r.error}`);
else if (!r.conforma) console.log(r.reporte);
```

`validarProyecto(turtle, { token, url?, fetch?, timeoutMs? })` nunca tira; devuelve un `Resultado`. `timeoutMs` (default
30 000) cubre la respuesta entera; si se cumple, vuelve como `status: null`.

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
| `{ ok: false, status: null, error }`     | no hubo respuesta: red caída, DNS, TLS o timeout                     |

`fetch` acepta uno propio (tests, proxies); recibe un `Request`, como en openapi-fetch.

### Puestos de trabajo: `jobs`

Un módulo por clase de la ontología, no por endpoint: `jobs` es la clase `JobPost`, con sus métodos: `get` para leer y
dos acciones, `descartar` y `marcarAplicado`.

```ts
import { type JobPost, jobs } from "jsr:@kiri23/ontology-client";

const lista: JobPost[] = await jobs.get({ tecnologia: "python" }); // o { fuente: "hn" }, o nada: todos
lista[0].empresa; // string | undefined
lista[0].pide[0].nombre; // string: cada tecnología es un Technology { link, nombre, sinonimos }
```

`jobs.get(filtros?, { url?, fetch?, timeoutMs? })` va a `GET /jobs` sin token y devuelve la lista, lo más nuevo primero.
A diferencia de `validarProyecto`, **tira** cuando no hay lista: un `ErrorServidor` con `status` (503, 400, 200 fuera
del contrato, o `null` si no hubo respuesta) y el `{"error"}` del servidor en el mensaje. El 503 es "datos viejos": el
mensaje dice que `POST /jobs` los rehace (sin argumentos trae las dos fuentes).

#### Acciones: `descartar` y `marcarAplicado`

Son los action types del servidor (al estilo de Palantir Foundry): cada una está declarada en el grafo del servidor, con
sus parámetros y su precondición, y sale en el contrato como una operación (`jobs_descartar`, `jobs_marcar_aplicado`).
Escriben, así que piden token.

```ts
import { jobs } from "jsr:@kiri23/ontology-client";

const token = Deno.env.get("ONTOLOGY_ACCIONES_TOKEN")!; // con la url de producción, opcional: lo lee de ahí
const [puesto] = await jobs.get({ tecnologia: "python" });

const descartado = await jobs.descartar(puesto, "pide 5 años de Java", { token });
descartado.descartadoEl; // string | undefined (date-time); descartado.porque: "pide 5 años de Java"

const aplicado = await jobs.marcarAplicado(puesto.link, { token }); // el puesto o su link
aplicado.aplicadoEl;
```

- `jobs.descartar(job, porque, { token?, url?, fetch?, timeoutMs? })` → `POST /jobs/descartar` con `{"link", "porque"}`.
- `jobs.marcarAplicado(job, { token?, url?, fetch?, timeoutMs? })` → `POST /jobs/marcar-aplicado` con `{"link"}`.
- `job` es el `JobPost` (o cualquier cosa con `link`) o el link solo. Las dos devuelven el `JobPost` como queda.
- Token: `token`. Solo si la url es la de producción (o no se pasa), sin `token` usa la variable
  `ONTOLOGY_ACCIONES_TOKEN` si Deno tiene permiso para leerla (`--allow-env`; sin permiso no pregunta). Con cualquier
  otra url el token va explícito: el de producción no sale hacia una url que no es la suya. Sin ninguno, el pedido va
  sin token y el servidor responde 401.
- La url tiene que ser `https:`; `http:` solo a `localhost`, `127.0.0.1` o `[::1]`. Si no, tiran `TypeError` sin pedir
  nada: el token iría en claro.
- Tiran `ErrorServidor`, como `jobs.get`: **400** si el puesto no existe, falta `porque` o no se cumple la precondición
  (el mensaje es el del servidor: `Ya lo descartaste.`, `Ya aplicaste a este puesto.`), **401** sin token o con otro,
  **503** si el servidor no tiene token configurado, `null` si no hubo respuesta.

Traer puestos nuevos no tiene método todavía: el 200 de `POST /jobs` no declara schema en el contrato, así que
devolvería `unknown`. Va por el cliente tipado: `crearCliente().POST("/jobs")` trae las dos fuentes, y
`{ params: { query: { kiri_jobs: "--hn" } } }` (o `--remotive`) elige una.

### Motores: de dónde lee `jobs.get()`

Como los backends de base de datos de Django: el motor se elige **una vez**, al arrancar, y todo `jobs.get()` lee de
ahí. El default es HTTP (`GET /jobs`); quien no llama a `configurar` no nota nada.

```ts
import neo4j from "npm:neo4j-driver@^6.2.0";
import { configurar, jobs } from "jsr:@kiri23/ontology-client";
import { motorNeo4j } from "jsr:@kiri23/ontology-client/neo4j";

const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", password));
configurar({ motor: motorNeo4j(driver) });

await jobs.get({ tecnologia: "python" }); // lo mismo, byte a byte, que GET /jobs?tecnologia=python
await jobs.descartar(puesto, "no", { token }); // las acciones siguen por HTTP a la fuente
await driver.close(); // el driver es tuyo: el motor no lo cierra
```

- `configurar({ motor })` — `motorHttp` (el default) o `motorNeo4j(driver)`. Tira `TypeError` si no es un `Motor`.
- `motorNeo4j(driver, { database? })` vive en `@kiri23/ontology-client/neo4j`, un entry point aparte: quien usa solo
  HTTP no baja `neo4j-driver`. No envuelve al driver: lo creás vos (URL, auth, config) y lo inyectás.
- Neo4j es una **vista de solo lectura** de los datos del RDF, sin esquema (`neo4j/README.md`): sale entera del
  `/sparql` público, cada dato con su clase como label; el motor lee en `executeRead` y las acciones (`descartar`,
  `marcarAplicado`) van siempre por HTTP a la fuente, con cualquier motor.
- Con Neo4j, `url` y `fetch` de `jobs.get` no se usan; `timeoutMs` acota la espera entera (conexión y reintentos del
  driver incluidos, que con el túnel caído son 30 s) y también es el timeout de la transacción. Todo error (Neo4j caído,
  password, un puesto que no calza con `JobPost`) es `ErrorServidor` con `status: null` y el error del driver en
  `cause`.
- En Deno, `neo4j-driver` lee `os.release()` al crear el driver: `--allow-sys=osRelease`.
- **La vista no se actualiza sola.** Muestra lo que había en la fuente la última vez que se corrió
  `deno task neo4j:cargar`: un `POST /jobs` en producción no entra hasta recargar. Y como las acciones escriben en la
  fuente, `jobs.descartar()` seguido de `jobs.get()` por Neo4j **no** muestra `descartadoEl` (ni `marcarAplicado()`,
  `aplicadoEl`): el puesto que devuelve la acción sí lo trae. Una vista vacía o con una carga cortada no devuelve `[]`:
  tira `la vista Neo4j no está cargada`.

La vista (el container, cómo se carga con n10s, el mapeo RDF → Neo4j, los named graphs, la memoria) está en
[`neo4j/README.md`](neo4j/README.md).

### SPARQL crudo: `sparql`

```ts
import { sparql } from "@kiri23/ontology-client";

const { tipo, texto } = await sparql.consultar("SELECT ?c (COUNT(*) AS ?n) WHERE { ?s a ?c } GROUP BY ?c");
const filas = JSON.parse(texto).results.bindings; // tipo: application/sparql-results+json
```

`sparql.consultar(consulta, { accept?, url?, fetch?, timeoutMs? })` va a `GET /sparql?query=` sin token y devuelve la
respuesta tal cual (`{ tipo, texto }`). El `Accept` por default es `application/sparql-results+json`; el servidor
respeta `text/csv` en SELECT, pero en CONSTRUCT siempre manda Turtle. Tira `ErrorServidor` con el `{"error"}` del
servidor (400 si la consulta no parsea) o `status: null` si no hubo respuesta.

### El cliente tipado, sin envoltorio

`validarProyecto` está hecha encima de [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), y esa librería queda a la
vista: `crearCliente()` devuelve su `Client<paths>` tal cual, con los paths del contrato, para usar middleware o
cualquier otra cosa que `validarProyecto` no previó.

```ts
import { crearCliente } from "jsr:@kiri23/ontology-client@0.1.1";

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
deno run --allow-net --allow-read --allow-env jsr:@kiri23/ontology-client@0.1.1/cli proyectos/*/proyecto.ttl
deno run --allow-net --allow-read --allow-env cli.ts --url http://localhost:8899 proyecto.ttl   # desde el repo
```

- URL: `--url`, o `ONTOLOGY_URL`, o `https://ontology.kiri231.com` (vacía cuenta como no dada). Si es `http://` a un
  host que no es local, avisa: el token viaja en claro.
- Token: solo `ONTOLOGY_PROYECTOS_TOKEN` (por flag quedaría en el historial y en la lista de procesos).
- Timeout por ficha: `--timeout` u `ONTOLOGY_TIMEOUT`, en segundos (default 30).
- Exit: **0** todas conforman · **1** alguna no conforma · **2** error de uso, lectura, red, timeout o token. **El 2 le
  gana al 1**: si una ficha no conforma y otra no se pudo validar, sale 2, porque el resultado no cubre todas.
- Un 401, un 503, cualquier otro 5xx, la red caída o el timeout cortan en la primera ficha: las demás fallarían igual.
  Un 400, 413 o 415 son de esa ficha: sigue con las demás.
- Con `GITHUB_ACTIONS=true` emite `::error file=<archivo>,title=...::<mensaje>` por cada ficha que no conforma o no se
  pudo validar. El resto de la salida (el reporte copia literales de la ficha) sale neutralizado: una línea que
  empezaría con `::` lleva un espacio de ancho cero adelante, así una ficha no puede colar un workflow command
  (`::add-mask::`, `::stop-commands::`, anotaciones falsas) en el log.

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
          # archivos: proyectos/*/proyecto.ttl   # opcional; default: todo proyecto.ttl que git conoce
          # url: https://ontology.kiri231.com    # opcional
          # timeout: 30                          # opcional, segundos por ficha
```

| Input      | Default                        | Qué es                                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------------------------- |
| `token`    | (requerido)                    | el token del servidor; sin él el paso falla                            |
| `archivos` | los `proyecto.ttl` del repo    | rutas o globs (`**` incluido) separados por espacios o saltos de línea |
| `url`      | `https://ontology.kiri231.com` | la URL base del servidor                                               |
| `timeout`  | `30`                           | segundos por ficha antes de dar el servidor por caído                  |

Sin `archivos`, valida los archivos que se llaman exactamente `proyecto.ttl` (no `otroproyecto.ttl`) y que git conoce:
`git ls-files -z -- ':(glob)proyecto.ttl' ':(glob)**/proyecto.ttl'`, rutas no ASCII incluidas. Si el repo no tiene
ninguna, sale 0 con un aviso.

Antes de adoptarla:

- **Va después de `actions/checkout`.** Sin checkout no hay repo, `git ls-files` falla y la action falla con exit 2 y un
  error que lo dice. No da verde sin haber validado nada.
- **El token.** `ONTOLOGY_PROYECTOS_TOKEN` es el token que el servidor tiene configurado; lo da el dueño del servidor.
  Se carga como secret del repo consumidor: `gh secret set ONTOLOGY_PROYECTOS_TOKEN -R <owner>/<repo>` (pide el valor
  por stdin, no queda en el historial).
- **PRs desde forks.** GitHub no les pasa secretos: sin token el paso falla con exit 2. O el check no se exige para
  forks, o el workflow usa `pull_request_target`. En ese caso la ficha viene de alguien de afuera y el workflow tiene el
  secreto: no hagas checkout del código del PR para ejecutarlo, solo de las fichas. La salida de la action ya neutraliza
  los workflow commands que traiga una ficha.
- **Deno en el PATH.** La action instala Deno 2.9.5 con `denoland/setup-deno` y queda primero en el `PATH` del job: los
  pasos que siguen corren con ese Deno. Si el job usa otra versión, poné tu `setup-deno` después de esta action.

Los inputs pasan al script por variables de entorno, nunca interpolados: no se puede inyectar shell. La action instala
Deno 2.9.5 con `denoland/setup-deno` fijado por SHA y corre el `cli.ts` de la versión de la action, con su propio
`deno.json` y lockfile (`--frozen`), así el `deno.json` del repo que la usa no interfiere.

`v0` es un tag móvil que apunta al último `v0.x.y`; para fijar, `@v0.1.1` o un SHA.

## Desarrollo

```sh
deno task test        # tests: fetch falso, anotaciones, workflow commands, timeout, exit codes del proceso
ONTOLOGY_PRODUCCION=1 deno task test   # además, jobs.get() contra producción (solo lee)
ONTOLOGY_ACCIONES_URL=http://127.0.0.1:8800 ONTOLOGY_ACCIONES_TOKEN=prueba-local deno task test   # acciones, server local
NEO4J_URL=bolt://localhost:7687 doppler run -p ontology -c dev -- deno task test   # además, paridad Neo4j == producción
doppler run -p ontology -c dev -- deno task neo4j:cargar   # rehace la vista Neo4j desde /sparql
deno fmt --check && deno lint && deno task generar --check
deno run --allow-net --allow-read tests/servidor-falso.ts --puerto 8787 --token prueba
```

**Pre-commit.** `deno task hooks` lo activa una vez por clon, y vale para sus worktrees. Antes de cada commit,
`.githooks/pre-commit` corre fmt, lint, `deno check` y `deno task test` como el job `calidad` de `ci.yml`; si el commit
toca `explorador/`, también `npm run check` y `npm test` ahí (necesitan `explorador/node_modules`). De cada paso imprime
el resumen, y la salida entera si falla. La tarea deja un atajo en `~/.local/share/git-hooks/ontology-client/` que corre
el hook con `sh`: en `/storage` (Termux) git ignora un hook sin bit de ejecución. En una rama que todavía no tiene el
hook, el atajo no hace nada. `git commit --no-verify` lo salta, solo si sabés por qué.

Las acciones escriben, así que su test de punta a punta va **solo** contra un ontologyLearning local
(`ONTOLOGY_ACCIONES_TOKEN=prueba-local python3 main.py web --puerto 8800` con `datos/jobs.trig` =
`tests/fixtures/jobs.trig`): sin `ONTOLOGY_ACCIONES_URL` se saltea (CI no lo corre) y si no es `localhost`/`127.0.0.1`
falla antes de pedir nada. Cada corrida descarta un puesto que no tenía decisiones; cuando no quedan, borrá
`datos/decisiones.trig` del servidor.

`tests/servidor-falso.ts` imita el contrato sin el motor: una ficha no conforma si trae la línea
`# servidor-falso: no conforma`. CI lo levanta para probar la action con `uses: ./`, y en otro job la prueba sin repo
git, con un repo sin fichas y con nombres parecidos a `proyecto.ttl`. `tests/servidor-mudo.ts` acepta conexiones y nunca
responde: prueba el timeout.

`deno.json` tiene `lock.frozen`: nada cambia `deno.lock` sin querer. Para sumar o subir una dependencia,
`deno install --frozen=false` y commitear el lock.

### Publicar

`.github/workflows/publish.yml` publica en JSR por OIDC (sin token) al empujar un tag `v*` o cuando un push a `main`
toca `deno.json`. Para una versión nueva: subir `version` en `deno.json`, mergear, `git tag vX.Y.Z && git push --tags`,
y mover `v0` al mismo commit: `git tag -f v0 'vX.Y.Z^{}' && git push -f origin v0`.

OIDC exige que el paquete exista en jsr.io y esté vinculado a este repo:

1. Crear el paquete: <https://jsr.io/new?scope=kiri23&package=ontology-client>.
2. En <https://jsr.io/@kiri23/ontology-client/settings>, **GitHub repository** → `Kiri23/ontology-client` → Link.
3. Correr el publish: `gh workflow run publish.yml -R Kiri23/ontology-client`.

## Explorador

<https://ontology.kiri231.com/explorador/> es un Storybook del SDK: cada función de `mod.ts` es una historia que se
corre contra el servidor, con controles para sus parámetros. Vive en `explorador/` (Vite + React) y no entra en el
paquete de JSR. `tests/explorador.test.ts` falla si una función exportada no tiene su historia: ver
[explorador/README.md](explorador/README.md). Su vista Grafo trae el grafo entero con `sparql.consultar` y lo consulta
en el navegador.

## Licencia

MIT
