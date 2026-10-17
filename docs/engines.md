# Engines: where `jobs.get()` reads from

Like Django's database backends: you pick the engine **once**, at startup, and every `jobs.get()` reads from it. The
default is HTTP (`GET /jobs`); if you never call `configurar`, nothing changes for you.

```ts
import neo4j from "npm:neo4j-driver@^6.2.0";
import { configurar, jobs } from "jsr:@kiri23/ontology-client";
import { motorNeo4j } from "jsr:@kiri23/ontology-client/neo4j";

const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", password));
configurar({ motor: motorNeo4j(driver) });

await jobs.get({ tecnologia: "python" }); // the same, byte for byte, as GET /jobs?tecnologia=python
await jobs.descartar(puesto, "no", { token }); // actions still go over HTTP to the source
await driver.close(); // the driver is yours: the engine does not close it
```

- `configurar({ motor })` — `motorHttp` (the default) or `motorNeo4j(driver)`. Throws `TypeError` if it is not a
  `Motor`.
- `motorNeo4j(driver, { database? })` lives in `@kiri23/ontology-client/neo4j`, a separate entry point: if you only use
  HTTP you never download `neo4j-driver`. It does not wrap the driver: you create it (URL, auth, config) and inject it.
- Neo4j is a **read-only view** of the data in the [RDF](vocabulary/rdf.md) graph, with no schema (`neo4j/README.md`):
  it is built entirely from the public `/sparql`, each record with its class as a label. The engine reads in
  `executeRead`, and the actions (`descartar`, `marcarAplicado`) always go over HTTP to the source, whatever the engine.
- With Neo4j, `jobs.get`'s `url` and `fetch` are not used; `timeoutMs` bounds the whole wait (including the driver's
  connection and retries, which take 30 s when the tunnel is down) and is also the transaction timeout. Every error
  (Neo4j down, wrong password, a job post that does not fit `JobPost`) is an `ErrorServidor` with `status: null` and the
  driver's error in `cause`.
- In Deno, `neo4j-driver` reads `os.release()` when it creates the driver: `--allow-sys=osRelease`.

## The view does not update itself

It shows what the source had the last time someone ran `deno task neo4j:cargar`: a `POST /jobs` in production does not
show up until the next load. And because the actions write to the source, `jobs.descartar()` followed by `jobs.get()`
through Neo4j does **not** show `descartadoEl` (nor, after `marcarAplicado()`, `aplicadoEl`): the job post that the
action returns does have it. An empty view, or one with an interrupted load, does not return `[]`: it throws
`la vista Neo4j no está cargada`.

The view itself (the container, how n10s loads it, the RDF → Neo4j mapping, the named graphs, the memory) is described
in [`neo4j/README.md`](../neo4j/README.md).

## `deno task neo4j:hola`

The hello world of the Neo4j view, for whoever maintains it. `ejemplos/hola-neo4j.ts` connects to Neo4j, counts nodes
per class in Cypher with the driver as is, shows one job post with the technologies it asks for, and then runs
`jobs.get({ tecnologia: "python" })` through the SDK with the Neo4j engine: same signature, different engine.

It needs two things that only the maintainer has:

- **The ssh tunnel** to the VM, open in another tab (Neo4j only listens on the VM's `127.0.0.1`):

  ```sh
  ssh -N -L 7687:localhost:7687 -L 7474:localhost:7474 neo4j-ontology.exe.xyz
  ```

- **`NEO4J_PASSWORD`**, which Doppler injects. Without it the example exits 2.

```sh
doppler run -p ontology -c dev -- deno task neo4j:hola
```

`NEO4J_URL` defaults to `bolt://localhost:7687`; over the tailnet it can be `bolt://100.123.48.55:7687` (see
[`neo4j/README.md`](../neo4j/README.md)). The task only allows the network, those two variables and
`--allow-sys=osRelease`.

To try the SDK without secrets or a tunnel, use `deno task hola` instead (see [library.md](library.md)).
