# The Neo4j view of the RDF graph

Neo4j is a **view** of ontologyLearning's [RDF](../docs/vocabulary/rdf.md) graph, not a source. The RDF is the truth:
the view is rebuilt entirely from it with [neosemantics (n10s)](https://github.com/neo4j-labs/neosemantics), and nothing
writes to Neo4j anything that does not come from the RDF. The SDK reads it with the Neo4j engine (`motorNeo4j(driver)`,
`../neo4j.ts`) in read-only transactions.

```
production /sparql ──CONSTRUCT (data only)──n10s.rdf.import.fetch──▶ Neo4j ──executeRead──▶ jobs.get() ≡ GET /jobs
```

**Data only, no schema.** Neo4j does not reason: it infers nothing from `rdfs:Class`, `rdf:Property` or the shapes. Each
record already carries its class as a label (`ontologia__JobPost`), and the schema lives in the RDF, where it is
actually used ([SHACL shapes](../docs/vocabulary/shacl-shape.md), the
[contract](../docs/vocabulary/openapi-contract.md)).

## Versions

| Piece        | Version                                                      | Why                                                                            |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Neo4j        | `neo4j:2025.06.2-community`, pinned by digest (`Dockerfile`) | the one n10s asks for: its `pom.xml` at tag 2025.06.1 says `2025.06.2`         |
| n10s         | `neosemantics-2025.06.1.jar`, with `ADD --checksum=sha256:…` | the latest release (2026-06-16); NEO4J_PLUGINS would pick a version on its own |
| neo4j-driver | `npm:neo4j-driver@^6.2.0` (`deno.json`; the lock pins 6.2.0) | a range: the consumer's `Driver` can be another 6.x                            |

## Starting it

On the VM (`neo4j-ontology` on exe.dev, it comes with docker), from this directory:

```sh
# the password comes from Doppler and never goes through the screen or git
ssh neo4j-ontology.exe.xyz 'mkdir -p ~/neo4j'
doppler run -p ontology -c dev -- sh -c 'printf "NEO4J_AUTH=neo4j/%s\n" "$NEO4J_PASSWORD" |
  ssh neo4j-ontology.exe.xyz "umask 077; cat > ~/neo4j/.env"'
scp Dockerfile compose.yaml neo4j-ontology.exe.xyz:neo4j/
ssh neo4j-ontology.exe.xyz 'cd ~/neo4j && docker compose up -d --build'
```

Bolt (7687) and the browser (7474) only listen on the VM's `127.0.0.1`. From outside, use a tunnel:

```sh
ssh -N -L 7687:localhost:7687 -L 7474:localhost:7474 neo4j-ontology.exe.xyz
```

With the tunnel open:

- **See it:** `http://localhost:7474/browser/` is the Neo4j Browser that comes with the image. Connect to
  `bolt://localhost:7687` with user `neo4j` and the password from Doppler (`ontology/dev`, `NEO4J_PASSWORD`). A first
  Cypher query: `MATCH (p:ontologia__JobPost)-[r:ontologia__pide]->(t) RETURN p, r, t LIMIT 25`.
- **Talk to it from code:** `doppler run -p ontology -c dev -- deno task neo4j:hola` runs `ejemplos/hola-neo4j.ts`: it
  connects, counts nodes per class in Cypher, shows one job post with what it asks for, and then runs
  `jobs.get({ tecnologia: "python" })` through the SDK with the Neo4j engine. More in
  [docs/engines.md](../docs/engines.md).

**Without a tunnel, on exe.dev:** exe.dev's private proxy publishes the VM's port 8000 at
`https://neo4j-ontology.exe.xyz/`, behind the exe.dev login. `Caddyfile` and `compose.exe-dev.yaml` put a Caddy there
that joins both ports into one origin: bolt's WebSocket goes to 7687 and everything else, the Browser, to 7474. Neo4j
still listens only on `127.0.0.1`.

```sh
scp Caddyfile neo4j-ontology.exe.xyz:neo4j/ && scp compose.exe-dev.yaml neo4j-ontology.exe.xyz:neo4j/compose.override.yaml
ssh neo4j-ontology.exe.xyz 'cd ~/neo4j && docker compose up -d'
```

Open `https://neo4j-ontology.exe.xyz/browser/` and connect with **`bolt+s://neo4j-ontology.exe.xyz:443`**. With
`neo4j+s://` it fails: it asks for the routing table and Neo4j announces itself as `localhost:7687`. Exposing 7474 and
7687 separately (`https://…:7474` and `:7687`) does not work either: the WebSocket to `:7687` fails
(`ServiceUnavailable: WebSocket connection
failure`).

**Over the tailnet (phone apps), without MagicDNS:** the VM is on the tailnet with IP `100.123.48.55` (`neo4j-ontology`,
tag `tag:exec`). It joined through exe.dev's "Tailscale Workload Identity Federation" integration (`tailscale-wif`, no
auth key on the VM). Termux does not use Tailscale's DNS, so everything goes by IP, and with an IP there is no
certificate: it goes in clear text over WireGuard, which already encrypts the tailnet. `tailscale serve` forwards TCP,
only inside the tailnet:

- `http://100.123.48.55` (80 → the Caddy on 8000): the Browser, the Query API (`/db/neo4j/query/v2`) and bolt's
  WebSocket. It is `--tcp` and not `--http`, because `--http` routes by host name and with the IP it gives 404.
- `bolt://100.123.48.55:7687` or `neo4j://100.123.48.55:7687`: native bolt. For `neo4j://` to work,
  `compose.exe-dev.yaml` makes Neo4j announce that IP in its routing table
  (`NEO4J_server_default__advertised__address`); otherwise it announces `localhost`.

```sh
# the join, once (the token lasts 5 minutes and is never printed)
ssh neo4j-ontology.exe.xyz 'W=https://tailscale-wif.int.exe.xyz; M="$(curl -fsS $W/metadata)";
  T="$(curl -fsS $W/token | jq -er .token)"; sudo tailscale up --hostname=neo4j-ontology \
  --client-id="$(echo "$M" | jq -er .client_id)?ephemeral=false&preauthorized=true" --id-token="$T" \
  --advertise-tags="$(echo "$M" | jq -r .tags)"'
ssh neo4j-ontology.exe.xyz 'sudo tailscale serve --bg --tcp=80 tcp://localhost:8000;
  sudo tailscale serve --bg --tcp=7687 tcp://localhost:7687'
```

Tested from Termux by IP (2026-10-15, labels from before the rename): the Query API with
`MATCH (j:j__JobPost) RETURN count(j)` gives `[[131]]`, `/browser/` gives 200, and
`NEO4J_URL=bolt://100.123.48.55:7687 deno task neo4j:hola` (and `neo4j://`) brings the 35 job posts with python. The IP
changes if the VM is recreated: `tailscale ip -4` on the VM.

## Loading it (and refreshing it)

```sh
doppler run -p ontology -c dev -- deno task neo4j:cargar        # --sparql <url> for another source
```

Everything comes from the public `/sparql`: nothing private is needed. `scripts/neo4j-cargar.ts` is idempotent: **it
deletes everything and imports again**. Refreshing means running it again; there are no deltas, so the view can never
keep a triple that the source no longer has. The steps:

0. Before touching anything, `/sparql` has to answer the count of distinct triples in the pattern:
   `SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { … } }`. If the source is down, the view stays as it
   was.
1. `MATCH (c:_Carga) DELETE c` (from here on the view counts as not loaded) and `MATCH (n) DETACH DELETE n` (including
   n10s's config and its prefixes, which are nodes).
2. The n10s constraint: `CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE`.
3. `n10s.graphconfig.init(CONFIG_N10S)` and `n10s.nsprefixes.add` for each of `PREFIJOS` (`../vista-neo4j.ts`), before
   the fetch: that way each namespace in the data gets a readable prefix and not `ns0__`.
4. A single `n10s.rdf.import.fetch` of a `CONSTRUCT` to `/sparql` with `PATRON_DATOS`. Neo4j downloads it itself; it
   does not go through the machine that runs the load.
5. The check: the import has to end `OK`, with `triplesLoaded == triplesParsed` == the distinct triples that `/sparql`
   counted in step 0. Otherwise the load stops. (`COUNT(*)` without `DISTINCT` counts solutions: a triple in two named
   graphs, or a subject with two classes, would show up twice, and the `CONSTRUCT` returns it once.)
6. The sentinel, only if everything got in: `CREATE (:_Carga {completa: true, cuando: datetime(), triples: $triples})`.
   `motorNeo4j` asks for it in the same query as the job posts; without it, it throws
   `la vista Neo4j no está cargada: deno task neo4j:cargar` instead of returning `[]`. A load cut in half (the source
   goes down during the fetch, the import fails) leaves the view without a sentinel, and that shows.

`PATRON_DATOS`: every triple whose subject is an instance of a class that is not a schema class.

```sparql
?s a ?c . FILTER(?c NOT IN (rdfs:Class, rdf:Property, owl:Class, owl:ObjectProperty, owl:DatatypeProperty,
                            sh:NodeShape, sh:PropertyShape)) ?s ?p ?o
```

Real output (2026-10-15):

```
https://ontology.kiri231.com/sparql: OK, 1204 de 1204 triples
carga completa: 1204 triples
```

Against a view loaded before the sentinel existed, the engine threw what was expected (parity, 2026-10-15):
`ErrorServidor: neo4j jobs.get: la vista Neo4j no está cargada: deno task neo4j:cargar`.

There is no cron: you run it by hand after a `POST /jobs` or an action in production. If the view is stale, the parity
test says so.

## What the source has (checked on 2026-10-15)

```sh
S=https://ontology.kiri231.com/sparql
q() { curl -s -G "$S" --data-urlencode "query=$1" -H 'Accept: text/csv'; }
q 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }'                                   # 1279 in the union
q 'SELECT ?g (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } } GROUP BY ?g'       # the named graphs
q 'SELECT (COUNT(*) AS ?n) WHERE { ?s <https://kiri231.com/ontologia#descartadoEl> ?o }'   # 0: no decisions
curl -s https://ontology.kiri231.com/jobs | jq length                            # 131 job posts
```

| Graph                                                                   | Triples |
| ----------------------------------------------------------------------- | ------: |
| `urn:kiri-jobs:hn:2026-10-13T21:03:57+00:00`                            |     708 |
| `urn:kiri-jobs:remotive:2026-10-13T21:03:57+00:00`                      |     115 |
| `urn:kiri-repos:workflows`                                              |     341 |
| default graph: A_MANO from domain/ (106) + metadata of the 3 graphs (9) |     115 |

What goes into the view and what does not, with the same pattern as the load (`P` is `PATRON_DATOS`, with its `PREFIX`
lines):

```sh
q "SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { $P } }"         # 1204 triples
q "SELECT ?c (COUNT(DISTINCT ?s) AS ?n) WHERE { $P } GROUP BY ?c"                     # the classes, below
q "SELECT (COUNT(*) AS ?n) WHERE { $P FILTER(isBlank(?o) || isBlank(?s)) }"           # 0 blank nodes
q "SELECT (COUNT(DISTINCT ?o) AS ?n) WHERE { $P FILTER(isIRI(?o) && ?p != rdf:type)
     FILTER NOT EXISTS { ?o a ?c2 } }"                                                # 0 edges to something without a class
```

| Goes in (instances)                                                  | Stays out                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ontologia:JobPost` 131, `ontologia:Uso` 43, `ontologia:Workflow` 21 | the schema from domain/: `rdfs:Class`, `rdf:Property`, their `rdfs:comment`              |
| `ontologia:Technology` 15, `doap:Project` 15                         | the shapes (`sh:NodeShape`) and their blank nodes: they came from domain/'s `.ttl` files |
| `ontologia:Action` 10                                                | the named graph nodes `urn:kiri-*`: untyped, the graph's metadata                        |

The 15 `ontologia:Technology` come from production's default graph: `domain/tecnologias.ttl` is A_MANO on the server.
Since everything comes from the same source that GET /jobs reads, the view can no longer have data the server does not
see (it used to load domain/'s 14 `.ttl` files, more than the server's 6 A_MANO).

## Named graphs: flattened into the union

The server reads a job post's fields through the **union** (`Dataset(default_union=True)`): decisions live in their own
graphs (`urn:kiri-acciones:…`) and show up just the same. The view does the same: a single graph, the union.

- n10s does import quads: `n10s.experimental.quadrdf.import.fetch` (TriG and N-Quads) stores the graph name as a
  `graphUri` property and creates **one node per (uri, graph)** (`RDFQuadDirectStatementLoader.java`, tag 2025.06.1). A
  `tecnologia:Python` that lives in domain/ and is asked for from the hn graph would be two nodes, and reading through
  the union would mean joining them by uri in every query. Besides, `/sparql` does not return TriG: `CONSTRUCT` gives
  triples.
- **What is lost:** which graph each triple belongs to, and each graph's metadata (`dct:source "kiri-jobs -j (hn)"`,
  `prov:generatedAtTime`, `rdfs:comment`): the graph's URI has no `rdf:type`, so `PATRON_DATOS` leaves it out. It is not
  needed: each job post carries its own source (a `dct__source` edge to `https://kiri231.com/fuente/hn`) and its date.
- **The order does not change:** `jobs.rq` orders by the graph's `prov:generatedAtTime`; the engine, by the job post's.
  `core/jobs.py` writes both with the same `cuando`, and a job post in two runs would have two dates, which the
  `JobPost` shape rejects (503). In valid data, they are the same order.

## The RDF → Neo4j mapping

`CONFIG_N10S` (`../vista-neo4j.ts`), what goes to `n10s.graphconfig.init`:

| Option                | Value     | What it does                                                                                                                                                            |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handleVocabUris`     | `SHORTEN` | `rdfs:label` → property `rdfs__label`, `ontologia:JobPost` → label `ontologia__JobPost`                                                                                 |
| `handleMultival`      | `ARRAY`   | **every** literal is a list: `skos:altLabel` → `skos__altLabel: ["Node","NodeJS"]`, and no value overwrites another (with the default, `OVERWRITE`, the last one stays) |
| `handleRDFTypes`      | `LABELS`  | `rdf:type` → node label (classes are not separate nodes)                                                                                                                |
| `keepLangTag`         | `false`   | no `@es`; today there are no lang tags in the data                                                                                                                      |
| `keepCustomDataTypes` | `false`   | a datatype that is not xsd stays as text, without `^^type`                                                                                                              |
| `applyNeo4jNaming`    | `false`   | names stay as they are in the RDF                                                                                                                                       |

`ARRAY` for everything and not only for `skos:altLabel`: that way the view never loses a value even if a property that
has one today brings two tomorrow, and the engine checks cardinality like the `JobPost` shape does (two titles → error,
like the 503).

- **IRIs:** each resource is a `:Resource` node with `uri`; the `n10s_unique_uri` constraint makes it unique.
- **Prefixes:** `PREFIJOS` (`ontologia`, `schema`, `doap`, `rdf`, `rdfs`, `skos`, `dct`, `prov`), registered before the
  fetch: one per namespace of a class or a predicate, and only one, because `n10s.nsprefixes.add` refuses a second
  prefix for the same namespace. A new namespace in the data that is not there would end up `ns0__`: add it to
  `PREFIJOS`. Instance namespaces (`tecnologia/`, `empresa/`, `fuente/`) need none: n10s keeps an instance's full `uri`.
- **Literals:** node properties, in lists. `xsd:string` → text; `xsd:boolean` → boolean (`ontologia__esPublico`);
  `xsd:dateTime` → Neo4j `DateTime` with its offset. The engine writes it back as Python's `isoformat()`
  (`2026-10-13T21:03:57+00:00`, microseconds only if they are not zero), which is what the server returns: Cypher's
  `toString()` would give `2026-10-13T21:03:57Z`. A lexical value written by hand with `Z` would come out `+00:00`:
  today Python writes every date.
- **Relationships:** a triple whose object is an IRI is an edge with the shortened predicate: `ontologia__pide`,
  `ontologia__accion`, `ontologia__tieneUso`, `ontologia__ejecutaEnCI`, `ontologia__tieneWorkflow`,
  `ontologia__alojadaEn`.
- **Company and source:** since ontologyLearning #50 they are nodes, not text. `ontologia:empresa` points to
  `https://kiri231.com/empresa/<slug>` (`schema__Organization`) and `dct:source` to `https://kiri231.com/fuente/hn`
  (`schema__WebSite`), each with its `rdfs__label` and a `schema__url` edge to its site. Two job posts from the same
  company share the node. `CONSULTA_JOBS` follows the edges and `aPuestos` rebuilds `{ link, nombre, url? }`. If the
  view was loaded from a server from before #50, the company is still a `ontologia__empresa` property: the engine throws
  `PuestoQueNoCalza` instead of returning job posts without a company.
- **Blank nodes and RDF lists:** there are none. They lived in the shapes, which no longer go in.

The counts below were measured on the 2026-10-15 load, before ontologyLearning renamed its namespaces: `j__` was
`kiri23.dev/jobs#`, `k__` was `kiri23.dev/catalogo#` and `t__` was `kiri23.dev/tech#`; today all three are
`ontologia__`. They have not been measured again.

Nodes per label with the graph loaded (`MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) ORDER BY count(*) DESC`):

```
Resource 235   j__JobPost 131   k__Uso 43   k__Workflow 21   doap__Project 15   t__Technology 15   k__Action 10
_Carga 1   _GraphConfig 1   _NsPrefDef 1
```

238 nodes and 316 relationships. Every `:Resource` has a class (0 with a single label), and there is no `rdf__Property`,
`rdfs__Class`, `sh__NodeShape`, `dash__*`, `bnode://` or `urn:` left.

### One JobPost, as it ended up (real output of a MATCH, 2026-10-15, labels from before the rename)

```cypher
MATCH (p:j__JobPost {uri: 'https://remotive.com/remote-jobs/software-development/senior-net-full-stack-developer-2091130'})
      -[r:j__pide]->(t)
RETURN labels(p), p.rdfs__label, p.j__empresa, p.dct__source, toString(p.prov__generatedAtTime[0]),
       type(r), t.uri, labels(t), t.skos__prefLabel, t.skos__altLabel
ORDER BY t.uri LIMIT 3
```

```
["Resource","j__JobPost"] ["Senior .NET Full-stack Developer"] ["Lemon.io"] ["remotive"] "2026-10-13T21:03:57Z"
  j__pide  https://kiri231.com/tecnologia/CSharp  ["Resource","t__Technology"]  ["C#"]       ["dotnet",".NET"]
  j__pide  https://kiri231.com/tecnologia/NodeJs  ["Resource","t__Technology"]  ["Node.js"]  ["Node","NodeJS"]
  j__pide  https://kiri231.com/tecnologia/Python  ["Resource","t__Technology"]  ["Python"]   null
```

`skos__altLabel` comes unordered (`["dotnet",".NET"]`) and `null` when there is none: the engine sorts it and returns
`"sinonimos": [".NET", "dotnet"]` and `[]`, like `core/formas.py` (`sorted(set(...), key=str)`).

## Parity with GET /jobs

`aPuestos` (`../vista-neo4j.ts`) does with Neo4j's rows what the server does (`comandos/jobs_get.py`,
`consultas/jobs.rq`, `core/formas.py`): keys in the order of `formas.objeto()`, missing optionals without `null`, `pide`
sorted by link, ordered by date desc (the instant) and title by code point, and both filters case-insensitive. The test
is `tests/neo4j-paridad.test.ts`: `JSON.stringify` of both sides, equal byte for byte.

```sh
NEO4J_URL=bolt://localhost:7687 doppler run -p ontology -c dev -- deno task test tests/neo4j-paridad.test.ts
```

```
  {}: 131 puestos, idénticos
  {"tecnologia":"python"}: 35 puestos, idénticos
  {"fuente":"hn"}: 115 puestos, idénticos
ok | 3 passed | 0 failed (8s)
```

Known differences, none present in today's data: `fuente` is compared with `toLowerCase` and the server uses
`casefold()` (they differ on letters like `ß`), and two job posts with the same date and the same title have no fixed
order on either side.

**Read-only.** The engine reads in `executeRead`, in a `READ` session. Neo4j rejects a write there (tested):
`Neo.ClientError.Statement.AccessMode: Writing in read access mode not allowed`.

## Memory (measured on 2026-10-15)

| Config (`compose.yaml`)                                                               | With the graph loaded and 3 `jobs.get()`                                                                                                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| same, `mem_limit: 640m`, data-only view (238 nodes)                                   | **387.2 MiB / 640 MiB** after loading, the parity test and `neo4j:hola` (2026-10-15T20:42:21Z); 0 restarts                                                        |
| same, with `mem_limit: 640m`, view with schema (346 nodes)                            | **347.4 MiB / 640 MiB** after a `MATCH (n)` over the whole graph, the Browser open and `neo4j:hola`; 0 restarts                                                   |
| heap 64m→96m, pagecache 16m, SerialGC, JIT C1 only, code cache 48m, `mem_limit: 448m` | OOM at 19:30 UTC with two clients at once (`anon-rss: 454396kB`, dmesg). Alone: **360.7 MiB / 448 MiB** (cold, just started: 259.9 MiB); before the review, 354.7 |
| heap 128m→160m, pagecache 16m, G1, `mem_limit: 384m`                                  | OOM during the load (`anon-rss: 389452kB`, dmesg)                                                                                                                 |
| heap 128m→192m, pagecache 32m, G1, `mem_limit: 512m`                                  | 453.9 MiB / 512 MiB                                                                                                                                               |

```sh
ssh neo4j-ontology.exe.xyz 'docker stats --no-stream; free -m'
# after: deno task neo4j:cargar … && deno task test tests/neo4j-paridad.test.ts
# 3dea15396d40 neo4j-neo4j-1  0.60%  387.2MiB / 640MiB  60.50%   (2026-10-15T20:42:21Z)
# Mem: total 7935  used 644  free 5665  (the whole VM)
```

What weighs is not the graph (238 nodes) but the JVM: removing the schema did not lower memory.
`jcmd <pid> VM.native_memory summary` with `-XX:NativeMemoryTracking=summary`: metaspace ~109 MB and symbols ~53 MB
(Neo4j's and n10s's classes), heap whatever it is given, code cache ~26 MB; with G1, 41 MB more of GC (SerialGC: 0.4
MB). With a single client it fits in 448m, but a `MATCH (n)` with the Browser open went past 448m: 640m leaves room for
real use. For a VPS, the number to reserve is ~640m.

`cypher-shell` inside the container is another JVM: with the tight limit, the container restarts. Manual queries go
through the tunnel with the driver.
