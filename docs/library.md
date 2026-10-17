# Library

The JSR package `@kiri23/ontology-client`: one function to validate a project file, one module per class of the
[ontology](vocabulary/ontology.md), raw [SPARQL](vocabulary/sparql.md), and the typed client underneath. The names in
the code are in Spanish (`validarProyecto`, `jobs.descartar`, `texto`); this page keeps them as they are, because they
are the real API.

To read from Neo4j instead of HTTP, see [engines.md](engines.md).

## Validate a project file: `validarProyecto`

```ts
import { validarProyecto } from "jsr:@kiri23/ontology-client@0.1.1";

const ficha = await Deno.readTextFile("proyectos/mi-proyecto/proyecto.ttl");
const r = await validarProyecto(ficha, { token: Deno.env.get("ONTOLOGY_PROYECTOS_TOKEN")! });

if (!r.ok) console.error(`no se pudo validar (HTTP ${r.status ?? "sin respuesta"}): ${r.error}`);
else if (!r.conforma) console.log(r.reporte);
```

A project file (`ficha`) is a [Turtle](vocabulary/turtle.md) file that describes one project. The server checks it
against its [SHACL shapes](vocabulary/shacl-shape.md).

`validarProyecto(turtle, { token, url?, fetch?, timeoutMs? })` never throws; it returns a `Resultado`. `timeoutMs`
(default 30 000) covers the whole response; if it runs out, the result comes back with `status: null`.

| `Resultado`                              | When                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `{ ok: true, conforma: true, reporte }`  | the file passes the rules                                                            |
| `{ ok: true, conforma: false, reporte }` | it does not pass them: this is a result, not an error (the server sends 200)         |
| `{ ok: false, status: 400, error }`      | empty body, or Turtle that does not parse                                            |
| `{ ok: false, status: 401, error }`      | the token is missing or wrong                                                        |
| `{ ok: false, status: 408, error }`      | the body did not arrive in full in time                                              |
| `{ ok: false, status: 411, error }`      | Content-Length is missing (does not happen with this client: it never sends chunked) |
| `{ ok: false, status: 413, error }`      | the file is over 256 KiB                                                             |
| `{ ok: false, status: 415, error }`      | the body is not sent as `text/turtle` (does not happen with this client)             |
| `{ ok: false, status: 503, error }`      | the server has no token configured: it fails closed                                  |
| `{ ok: false, status: null, error }`     | no response: network down, DNS, TLS or timeout                                       |

`fetch` takes your own (tests, proxies); it receives a `Request`, as in openapi-fetch.

## Job posts: `jobs`

One module per class of the ontology, not per endpoint: `jobs` is the `JobPost` class, with its methods: `get` to read
and two actions, `descartar` (dismiss) and `marcarAplicado` (mark as applied).

```ts
import { type JobPost, jobs } from "jsr:@kiri23/ontology-client";

const lista: JobPost[] = await jobs.get({ tecnologia: "python" }); // or { fuente: "hn" }, or nothing: all of them
lista[0].empresa; // string | undefined
lista[0].pide[0].nombre; // string: each technology is a Technology { link, nombre, sinonimos }
```

`jobs.get(filtros?, { url?, fetch?, timeoutMs? })` calls `GET /jobs` without a token and returns the list, newest first.
Unlike `validarProyecto`, it **throws** when there is no list: an `ErrorServidor` with `status` (503, 400, a 200 outside
the contract, or `null` if there was no response) and the server's `{"error"}` in the message. The 503 means "stale
data": the message says that `POST /jobs` rebuilds it (with no arguments it fetches both sources).

### Actions: `descartar` and `marcarAplicado`

These are the server's action types (in the style of Palantir Foundry): each one is declared in the server's graph, with
its parameters and its precondition, and it shows up in the contract as an operation (`jobs_descartar`,
`jobs_marcar_aplicado`). They write, so they need a token.

```ts
import { jobs } from "jsr:@kiri23/ontology-client";

const token = Deno.env.get("ONTOLOGY_ACCIONES_TOKEN")!; // with the production url, optional: it reads it from there
const [puesto] = await jobs.get({ tecnologia: "python" });

const descartado = await jobs.descartar(puesto, "pide 5 años de Java", { token });
descartado.descartadoEl; // string | undefined (date-time); descartado.porque: "pide 5 años de Java"

const aplicado = await jobs.marcarAplicado(puesto.link, { token }); // the job post or its link
aplicado.aplicadoEl;
```

- `jobs.descartar(job, porque, { token?, url?, fetch?, timeoutMs? })` → `POST /jobs/descartar` with
  `{"link", "porque"}`.
- `jobs.marcarAplicado(job, { token?, url?, fetch?, timeoutMs? })` → `POST /jobs/marcar-aplicado` with `{"link"}`.
- `job` is the `JobPost` (or anything with a `link`) or just the link. Both return the `JobPost` as it ends up.
- Token: `token`. Only when the url is the production one (or none is passed), and there is no `token`, it uses the
  `ONTOLOGY_ACCIONES_TOKEN` variable if Deno has permission to read it (`--allow-env`; without permission it does not
  prompt). With any other url the token must be explicit: the production token never goes to a url that is not its own.
  With neither, the request goes without a token and the server answers 401.
- The url must be `https:`; `http:` only to `localhost`, `127.0.0.1` or `[::1]`. Otherwise they throw `TypeError`
  without sending anything: the token would travel in clear text.
- They throw `ErrorServidor`, like `jobs.get`: **400** if the job post does not exist, `porque` is missing or the
  precondition fails (the message is the server's: `Ya lo descartaste.`, `Ya aplicaste a este puesto.`), **401** with no
  token or the wrong one, **503** if the server has no token configured, `null` if there was no response.

Fetching new job posts has no method yet: the 200 of `POST /jobs` declares no schema in the contract, so it would return
`unknown`. Use the typed client: `crearCliente().POST("/jobs")` fetches both sources, and
`{ params: { query: { kiri_jobs: "--hn" } } }` (or `--remotive`) picks one.

## Raw SPARQL: `sparql`

```ts
import { sparql } from "@kiri23/ontology-client";

const { tipo, texto } = await sparql.consultar("SELECT ?c (COUNT(*) AS ?n) WHERE { ?s a ?c } GROUP BY ?c");
const filas = JSON.parse(texto).results.bindings; // tipo: application/sparql-results+json
```

`sparql.consultar(consulta, { accept?, url?, fetch?, timeoutMs? })` calls `GET /sparql?query=` without a token and
returns the response as it came (`{ tipo, texto }`). The default `Accept` is `application/sparql-results+json`; the
server honors `text/csv` for SELECT, but for CONSTRUCT it always sends Turtle. It throws `ErrorServidor` with the
server's `{"error"}` (400 if the query does not parse) or `status: null` if there was no response.

`deno task hola` (`ejemplos/hola.ts`) is a hello world built on `sparql.consultar`: it counts the facts in the graph,
lists its classes and shows one instance. It needs no token and no tunnel.

## The typed client, unwrapped

`validarProyecto` is built on top of [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), and that library stays in
view: `crearCliente()` returns its `Client<paths>` as is, with the contract's paths, so you can use middleware or
anything else `validarProyecto` did not plan for.

```ts
import { crearCliente } from "jsr:@kiri23/ontology-client@0.1.1";

const cliente = crearCliente({ headers: { Authorization: `Bearer ${token}` } });
cliente.use({ onRequest: ({ request }) => console.log(request.method, request.url) });

const { data, error } = await cliente.POST("/proyectos", {
  body: ficha,
  bodySerializer: (t) => t, // openapi-fetch serializes to JSON by default: the file would go out in quotes
  headers: { "Content-Type": "text/turtle" },
});
```

The generated types are exported too (`paths`, `components`, `operations`), so you can use openapi-fetch's
`createClient<paths>()` directly.

## Generated from the contract

Nobody describes the endpoints by hand. The server generates its OpenAPI 3.1 [contract](vocabulary/openapi-contract.md)
from its command registry (`GET /openapi.json`); this repo keeps a copy and generates the types from it:

```
server ──GET /openapi.json──▶ contrato/openapi.json ──openapi-typescript──▶ generado/api.ts ──▶ mod.ts
            deno task contrato                         deno task generar
```

A type is born on the server as a SHACL shape and reaches your editor without anyone writing it: `j:JobPostShape` (TTL)
→ the `JobPost` schema in `contrato/openapi.json` → `components["schemas"]["JobPost"]` in `generado/api.ts` → `JobPost`
in `jobs.ts`.

```sh
deno task contrato                  # downloads the contract (default https://ontology.kiri231.com/openapi.json)
deno task contrato --url http://localhost:8899/openapi.json   # or ONTOLOGY_CONTRATO_URL
deno task generar                   # rewrites generado/api.ts
deno task generar --check           # fails if generado/ is not what the contract produces (CI runs it)
deno task vocabulario --check       # fails if docs/vocabulary/ is not what docs/vocabulary.ttl produces (CI runs it)
```

`contrato/` and `generado/` are committed together and never edited by hand. If the server changes the contract, you
refresh it, regenerate, and `deno check` flags whatever no longer fits.

**Other languages.** `contrato/openapi.json` is the source for all of them; TypeScript is the first reflection. A client
in another language goes in its own folder (`python/`, `go/`…) with its own generator that reads
`../contrato/openapi.json`, its committed `generado/` and its own `--check` in CI. The root stays TypeScript because JSR
and the action need it there.
