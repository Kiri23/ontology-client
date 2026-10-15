# La vista Neo4j del RDF

Neo4j es una **vista** del grafo RDF de ontologyLearning, no una fuente. El RDF es la verdad: la vista se rehace entera
desde él con [neosemantics (n10s)](https://github.com/neo4j-labs/neosemantics), y nada escribe en Neo4j algo que no
salga del RDF. El SDK la lee con el motor Neo4j (`motorNeo4j(driver)`, `../neo4j.ts`) en transacciones de solo lectura.

```
domain/*.ttl (privado) ──n10s.rdf.import.inline──┐
                                                 ├──▶ Neo4j ──executeRead──▶ jobs.get() ≡ GET /jobs
/sparql de producción ──CONSTRUCT──n10s fetch────┘
```

## Versiones

| Pieza        | Versión                                                       | Por qué                                                             |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Neo4j        | `neo4j:2025.06.2-community`, fijada por digest (`Dockerfile`) | la que pide n10s: su `pom.xml` en el tag 2025.06.1 dice `2025.06.2` |
| n10s         | `neosemantics-2025.06.1.jar`, con `ADD --checksum=sha256:…`   | la última release (2026-06-16); NEO4J_PLUGINS elegiría versión sola |
| neo4j-driver | `npm:neo4j-driver@^6.2.0` (`deno.json`; el lock fija 6.2.0)   | un rango: el `Driver` del consumidor puede ser otra 6.x             |

## Levantarla

En la VM (`neo4j-ontology` de exe.dev, trae docker), desde este directorio:

```sh
# la password sale de Doppler y no pasa por la pantalla ni por git
ssh neo4j-ontology.exe.xyz 'mkdir -p ~/neo4j'
doppler run -p ontology -c dev -- sh -c 'printf "NEO4J_AUTH=neo4j/%s\n" "$NEO4J_PASSWORD" |
  ssh neo4j-ontology.exe.xyz "umask 077; cat > ~/neo4j/.env"'
scp Dockerfile compose.yaml neo4j-ontology.exe.xyz:neo4j/
ssh neo4j-ontology.exe.xyz 'cd ~/neo4j && docker compose up -d --build'
```

Bolt (7687) y el browser (7474) escuchan solo en `127.0.0.1` de la VM. Desde afuera, un túnel:

```sh
ssh -N -L 7687:localhost:7687 -L 7474:localhost:7474 neo4j-ontology.exe.xyz
```

Con el túnel abierto:

- **Verla:** `http://localhost:7474/browser/` es el Neo4j Browser que trae la imagen. Conectá a `bolt://localhost:7687`
  con usuario `neo4j` y la password de Doppler (`ontology/dev`, `NEO4J_PASSWORD`). Un primer Cypher:
  `MATCH (p:j__JobPost)-[r:j__pide]->(t) RETURN p, r, t LIMIT 25`.
- **Hablarle desde código:** `doppler run -p ontology -c dev -- deno task neo4j:hola` corre `ejemplos/hola-neo4j.ts`: se
  conecta, cuenta nodos por clase en Cypher, muestra un puesto con lo que pide y después hace
  `jobs.get({ tecnologia: "python" })` por el SDK con el motor Neo4j.

## Cargarla (y refrescarla)

```sh
git -C <ontologyLearning> archive origin/main domain | tar -x -C /algun/dir   # o el domain/ de un checkout
doppler run -p ontology -c dev -- deno task neo4j:cargar --domain /algun/dir/domain
```

`scripts/neo4j-cargar.ts` es idempotente: **borra todo y vuelve a importar**. Refrescar es correrlo otra vez; no hay
deltas, así que la vista no puede quedar con un triple que la fuente ya no tiene. Los pasos:

0. Antes de tocar nada, `/sparql` tiene que responder la cuenta de triples distintos del patrón:
   `SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { … } }`. Si la fuente está caída, la vista queda
   como estaba.
1. `MATCH (c:_Carga) DELETE c` (desde acá la vista cuenta como no cargada) y `MATCH (n) DETACH DELETE n` (también la
   config de n10s y sus prefijos, que son nodos).
2. La constraint de n10s: `CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE`.
3. `n10s.graphconfig.init(CONFIG_N10S)` y `n10s.nsprefixes.add` de los prefijos que nombra la consulta del motor
   (`PREFIJOS` en `../vista-neo4j.ts`).
4. Cada `.ttl` de `--domain`, en orden alfabético: `n10s.nsprefixes.addFromText` (sus `@prefix` pasan a ser los de
   Neo4j) y `n10s.rdf.import.inline`. Son privados: viajan por bolt, no por una URL.
5. Producción: `n10s.rdf.import.fetch` de un `CONSTRUCT` a `/sparql`. Neo4j lo baja solo; no pasa por la máquina que
   corre la carga.
6. La verificación: cada import tiene que terminar `OK` con `triplesLoaded == triplesParsed`, y el de producción tiene
   que traer los triples distintos que `/sparql` contó en el paso 0. Si no, la carga corta. (`COUNT(*)` sin `DISTINCT`
   cuenta soluciones: un triple en dos named graphs saldría dos veces y el `CONSTRUCT` lo da una.)
7. El centinela, solo si todo entró: `CREATE (:_Carga {completa: true, cuando: datetime(), triples: $triples})`.
   `motorNeo4j` lo pide en la misma consulta que los puestos; sin él tira
   `la vista Neo4j no está cargada: deno task
   neo4j:cargar` en vez de devolver `[]`. Una carga cortada a la mitad (la
   fuente se cae durante el fetch, un import falla) deja la vista sin centinela, y se nota.

Salida real (2026-10-15):

```
…/domain/acciones.ttl: OK, 3 de 3 triples
…/domain/jobs-reglas.ttl: OK, 58 de 58 triples
…/domain/tecnologias.ttl: OK, 40 de 40 triples
…                                   (14 archivos, 377 triples)
https://ontology.kiri231.com/sparql: OK, 1173 de 1173 triples
carga completa: 1550 triples
```

Contra una vista cargada antes de que existiera el centinela, el motor tiró lo esperado (paridad, 2026-10-15):
`ErrorServidor: neo4j jobs.get: la vista Neo4j no está cargada: deno task neo4j:cargar`.

No hay cron: se corre a mano después de un `POST /jobs` o de una acción en producción. Si la vista está vieja, el test
de paridad lo dice.

## Qué hay en la fuente (comprobado el 2026-10-15)

```sh
S=https://ontology.kiri231.com/sparql
q() { curl -s -G "$S" --data-urlencode "query=$1" -H 'Accept: text/csv'; }
q 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }'                                   # 1279 en la unión
q 'SELECT ?g (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } } GROUP BY ?g'       # los named graphs
q 'SELECT (COUNT(*) AS ?n) WHERE { ?s <https://kiri23.dev/jobs#descartadoEl> ?o }'   # 0: sin decisiones
curl -s https://ontology.kiri231.com/jobs | jq length                            # 131 puestos
```

| Grafo                                                                 | Triples |
| --------------------------------------------------------------------- | ------: |
| `urn:kiri-jobs:hn:2026-10-13T21:03:57+00:00`                          |     708 |
| `urn:kiri-jobs:remotive:2026-10-13T21:03:57+00:00`                    |     115 |
| `urn:kiri-repos:workflows`                                            |     341 |
| default graph: A_MANO de domain/ (106) + metadata de los 3 grafos (9) |     115 |

Los 6 archivos A_MANO que sirve producción (106 triples) son idénticos a los de `domain/` de `origin/main` (0 de
diferencia, con rdflib). Por eso el `CONSTRUCT` deja afuera el default graph y lo trae `--domain`: si entrara por los
dos lados, sus blank nodes quedarían duplicados (n10s les da un id nuevo en cada import).

**La vista carga más que el servidor.** `--domain` trae los 14 `.ttl` de `domain/` (377 triples): los 6 A_MANO más las
reglas, las acciones, las formas de las lecturas y proyecto. El servidor arma su grafo solo con los A_MANO. Hoy esos 8
archivos de más no tocan lo que lee el motor (la paridad da idéntico), pero el riesgo existe: un `j:JobPost`, un
`rdfs:label` o un `skos:altLabel` escrito en una regla, una acción o un ejemplo entraría a la vista y no al servidor, y
`jobs.get()` por Neo4j devolvería un puesto, un título o un sinónimo que HTTP no. La paridad lo detecta; si pasa,
`--domain` tiene que recibir solo los A_MANO.

## Named graphs: aplanados a la unión

El servidor lee los campos de un puesto por la **unión** (`Dataset(default_union=True)`): las decisiones viven en sus
propios grafos (`urn:kiri-acciones:…`) y se ven igual. La vista hace lo mismo: un solo grafo, la unión.

- n10s sí importa quads: `n10s.experimental.quadrdf.import.fetch` (TriG y N-Quads) guarda el nombre del grafo como
  propiedad `graphUri` y crea **un nodo por (uri, grafo)** (`RDFQuadDirectStatementLoader.java`, tag 2025.06.1). Un
  `t:Python` que está en domain/ y es pedido desde el grafo de hn serían dos nodos, y leer por la unión obligaría a
  juntarlos por uri en cada consulta. Además `/sparql` no devuelve TriG: `CONSTRUCT` da triples.
- **Qué se pierde:** a qué grafo pertenece cada triple. La metadata de cada grafo no se pierde: está en el default graph
  como triples sobre la URI del grafo, y queda como un nodo (`urn:kiri-jobs:hn:…` con `dct__source`
  `["kiri-jobs -j (hn)"]`, `prov__generatedAtTime` y `rdfs__comment`), sin aristas hacia sus triples.
- **El orden no cambia:** `jobs.rq` ordena por el `prov:generatedAtTime` del grafo; el motor, por el del puesto.
  `core/jobs.py` escribe los dos con el mismo `cuando`, y un puesto en dos corridas tendría dos fechas, que la forma
  `JobPost` rechaza (503). En datos válidos, son el mismo orden.

## El mapeo RDF → Neo4j

`CONFIG_N10S` (`../vista-neo4j.ts`), lo que pasa a `n10s.graphconfig.init`:

| Opción                | Valor     | Qué hace                                                                                                                                                    |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handleVocabUris`     | `SHORTEN` | `rdfs:label` → propiedad `rdfs__label`, `j:JobPost` → label `j__JobPost`                                                                                    |
| `handleMultival`      | `ARRAY`   | **todo** literal es una lista: `skos:altLabel` → `skos__altLabel: ["Node","NodeJS"]`, y ningún valor se pisa (con el default, `OVERWRITE`, queda el último) |
| `handleRDFTypes`      | `LABELS`  | `rdf:type` → label del nodo (las clases no son nodos aparte)                                                                                                |
| `keepLangTag`         | `false`   | sin `@es`; hoy no hay lang tags en los datos                                                                                                                |
| `keepCustomDataTypes` | `false`   | un datatype que no es xsd queda como texto, sin `^^tipo`                                                                                                    |
| `applyNeo4jNaming`    | `false`   | los nombres quedan como en el RDF                                                                                                                           |

`ARRAY` para todo y no solo para `skos:altLabel`: así la vista no pierde un valor aunque una propiedad que hoy tiene uno
traiga dos mañana, y el motor chequea la cardinalidad como la forma `JobPost` (dos títulos → error, como el 503).

- **IRIs:** cada recurso es un nodo `:Resource` con `uri`; la constraint `n10s_unique_uri` la hace única.
- **Prefijos:** los de los `@prefix` de domain/ (`j`, `t`, `k`, `l`, `rdfs`, `skos`, `dct`, `prov`, `sh`, `dash`,
  `doap`, `schema`, `rdf`, `xsd`), más `PREFIJOS` antes que nada. Ningún namespace quedó con un `nsN` generado
  (`CALL n10s.nsprefixes.list()`).
- **Literales:** propiedades del nodo, en listas. `xsd:string` → texto; `xsd:integer` → entero (`sh__maxCount: [1]`);
  `xsd:dateTime` → `DateTime` de Neo4j con su offset. El motor lo vuelve a escribir como `isoformat()` de Python
  (`2026-10-13T21:03:57+00:00`, microsegundos solo si no son cero), que es lo que devuelve el servidor: `toString()` de
  Cypher daría `2026-10-13T21:03:57Z`. Un lexical escrito a mano con `Z` saldría `+00:00`: hoy todas las fechas las
  escribe Python.
- **Relaciones:** un triple con objeto IRI es una arista con el predicado acortado (`j__pide`, `sh__path`).
- **Blank nodes:** nodos `:Resource` con `uri: "bnode://<id>"` (40 hoy: las `sh:property` de las shapes y una lista). El
  id cambia en cada carga.
- **Listas RDF:** quedan como en el RDF, cadenas `rdf__first`/`rdf__rest` hasta `rdf:nil`. La única hoy es el
  `sh:ignoredProperties ( rdf:type )` de `k:ProyectoShape`.

Totales con el grafo cargado: 346 nodos (344 `:Resource`, más `_GraphConfig` y `_NsPrefDef`), 468 relaciones; 131
`j__JobPost`, 15 `t__Technology`, 12 `sh__NodeShape`.

### Un JobPost, como quedó (salida real de un MATCH)

```cypher
MATCH (p:j__JobPost {uri: 'https://remotive.com/remote-jobs/software-development/senior-net-full-stack-developer-2091130'})
      -[r:j__pide]->(t)
RETURN labels(p), p.rdfs__label, p.j__empresa, p.dct__source, toString(p.prov__generatedAtTime[0]),
       type(r), t.uri, labels(t), t.skos__prefLabel, t.skos__altLabel
ORDER BY t.uri LIMIT 3
```

```
["Resource","j__JobPost"] ["Senior .NET Full-stack Developer"] ["Lemon.io"] ["remotive"] "2026-10-13T21:03:57Z"
  j__pide  https://kiri23.dev/tech#CSharp  ["Resource","t__Technology"]  ["C#"]       ["dotnet",".NET"]
  j__pide  https://kiri23.dev/tech#NodeJs  ["Resource","t__Technology"]  ["Node.js"]  ["Node","NodeJS"]
  j__pide  https://kiri23.dev/tech#Python  ["Resource","t__Technology"]  ["Python"]   null
```

`skos__altLabel` viene sin orden (`["dotnet",".NET"]`) y `null` cuando no hay: el motor ordena y devuelve
`"sinonimos": [".NET", "dotnet"]` y `[]`, como `core/formas.py` (`sorted(set(...), key=str)`).

Una shape, con sus `sh:property` como blank nodes:

```
MATCH (:sh__NodeShape {uri:'https://kiri23.dev/jobs#JobPostShape'})-[:sh__property]->(b) …
{"bnode":"bnode://1728a53af7bc4ce3a93991773b9072b06","nombre":["empresa"],"max":[1],
 "path":["https://kiri23.dev/jobs#empresa"],"datatype":["http://www.w3.org/2001/XMLSchema#string"]}
```

## La paridad con GET /jobs

`aPuestos` (`../vista-neo4j.ts`) hace con las filas de Neo4j lo que hace el servidor (`comandos/jobs_get.py`,
`consultas/jobs.rq`, `core/formas.py`): claves en el orden de `formas.objeto()`, opcionales ausentes sin `null`, `pide`
ordenado por link, orden por fecha desc (el instante) y título por code point, y los dos filtros sin mayúsculas. La
prueba es `tests/neo4j-paridad.test.ts`: `JSON.stringify` de los dos lados, igual byte a byte.

```sh
NEO4J_URL=bolt://localhost:7687 doppler run -p ontology -c dev -- deno task test tests/neo4j-paridad.test.ts
```

```
  {}: 131 puestos, idénticos
  {"tecnologia":"python"}: 35 puestos, idénticos
  {"fuente":"hn"}: 115 puestos, idénticos
ok | 3 passed | 0 failed (6s)
```

Diferencias conocidas, ninguna presente en los datos de hoy: los `.ttl` de domain/ que el servidor no lee (arriba),
`fuente` se compara con `toLowerCase` y el servidor con `casefold()` (difieren en letras como `ß`), y dos puestos con la
misma fecha y el mismo título no tienen orden fijo en ninguno de los dos lados.

**Solo lectura.** El motor lee en `executeRead`, en una sesión `READ`. Una escritura ahí la rechaza Neo4j (probado):
`Neo.ClientError.Statement.AccessMode: Writing in read access mode not allowed`.

## Memoria (medida el 2026-10-15)

| Config (`compose.yaml`)                                                               | Con el grafo cargado y 3 `jobs.get()`                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| heap 64m→96m, pagecache 16m, SerialGC, JIT solo C1, code cache 48m, `mem_limit: 448m` | **360.7 MiB / 448 MiB** (en frío, recién arrancada: 259.9 MiB); antes de la revisión, 354.7 |
| heap 128m→160m, pagecache 16m, G1, `mem_limit: 384m`                                  | OOM durante la carga (`anon-rss: 389452kB`, dmesg)                                          |
| heap 128m→192m, pagecache 32m, G1, `mem_limit: 512m`                                  | 453.9 MiB / 512 MiB                                                                         |

```sh
ssh neo4j-ontology.exe.xyz 'docker stats --no-stream; free -m'
# después de: deno task neo4j:cargar … && deno task test tests/neo4j-paridad.test.ts
# ad88a81cb2c1 neo4j-neo4j-1  1.53%  360.7MiB / 448MiB  80.51%   (2026-10-15T18:54:08Z)
# Mem: total 7935  used 643  free 5674  (la VM entera)
```

Lo que pesa no es el grafo (346 nodos) sino la JVM. `jcmd <pid> VM.native_memory summary` con
`-XX:NativeMemoryTracking=summary`: metaspace ~109 MB y symbols ~53 MB (las clases de Neo4j y n10s), heap el que se le
dé, code cache ~26 MB; con G1, 41 MB más de GC (SerialGC: 0.4 MB). En un VPS con `mem_limit 384m` cabría por poco (~30
MB de margen); 448m deja aire para la carga.

`cypher-shell` dentro del container es otra JVM: con el límite ajustado, el container se reinicia. Las consultas a mano
van por el túnel con el driver.
