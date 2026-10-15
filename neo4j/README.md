# La vista Neo4j del RDF

Neo4j es una **vista** del grafo RDF de ontologyLearning, no una fuente. El RDF es la verdad: la vista se rehace entera
desde él con [neosemantics (n10s)](https://github.com/neo4j-labs/neosemantics), y nada escribe en Neo4j algo que no
salga del RDF. El SDK la lee con el motor Neo4j (`motorNeo4j(driver)`, `../neo4j.ts`) en transacciones de solo lectura.

```
/sparql de producción ──CONSTRUCT (solo datos)──n10s.rdf.import.fetch──▶ Neo4j ──executeRead──▶ jobs.get() ≡ GET /jobs
```

**Solo datos, sin esquema.** Neo4j no razona: no infiere nada de `rdfs:Class`, `rdf:Property` ni de las shapes. Cada
dato ya trae su clase como label (`j__JobPost`), y el esquema vive en el RDF, donde sí se usa (SHACL, el contrato).

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
doppler run -p ontology -c dev -- deno task neo4j:cargar        # --sparql <url> para otra fuente
```

Todo sale del `/sparql` público: no hace falta nada privado. `scripts/neo4j-cargar.ts` es idempotente: **borra todo y
vuelve a importar**. Refrescar es correrlo otra vez; no hay deltas, así que la vista no puede quedar con un triple que
la fuente ya no tiene. Los pasos:

0. Antes de tocar nada, `/sparql` tiene que responder la cuenta de triples distintos del patrón:
   `SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { … } }`. Si la fuente está caída, la vista queda
   como estaba.
1. `MATCH (c:_Carga) DELETE c` (desde acá la vista cuenta como no cargada) y `MATCH (n) DETACH DELETE n` (también la
   config de n10s y sus prefijos, que son nodos).
2. La constraint de n10s: `CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE`.
3. `n10s.graphconfig.init(CONFIG_N10S)` y `n10s.nsprefixes.add` de cada uno de `PREFIJOS` (`../vista-neo4j.ts`), antes
   del fetch: así cada namespace de los datos queda con un prefijo legible y no con `ns0__`.
4. Un solo `n10s.rdf.import.fetch` de un `CONSTRUCT` a `/sparql` con `PATRON_DATOS`. Neo4j lo baja solo; no pasa por la
   máquina que corre la carga.
5. La verificación: el import tiene que terminar `OK`, con `triplesLoaded == triplesParsed` == los triples distintos que
   `/sparql` contó en el paso 0. Si no, la carga corta. (`COUNT(*)` sin `DISTINCT` cuenta soluciones: un triple en dos
   named graphs, o un sujeto con dos clases, saldría dos veces y el `CONSTRUCT` lo da una.)
6. El centinela, solo si todo entró: `CREATE (:_Carga {completa: true, cuando: datetime(), triples: $triples})`.
   `motorNeo4j` lo pide en la misma consulta que los puestos; sin él tira
   `la vista Neo4j no está cargada: deno task neo4j:cargar` en vez de devolver `[]`. Una carga cortada a la mitad (la
   fuente se cae durante el fetch, el import falla) deja la vista sin centinela, y se nota.

`PATRON_DATOS`: cada triple cuyo sujeto es instancia de una clase que no es de esquema.

```sparql
?s a ?c . FILTER(?c NOT IN (rdfs:Class, rdf:Property, owl:Class, owl:ObjectProperty, owl:DatatypeProperty,
                            sh:NodeShape, sh:PropertyShape)) ?s ?p ?o
```

Salida real (2026-10-15):

```
https://ontology.kiri231.com/sparql: OK, 1204 de 1204 triples
carga completa: 1204 triples
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

Qué entra a la vista y qué no, con el mismo patrón de la carga (`P` es `PATRON_DATOS`, con sus `PREFIX`):

```sh
q "SELECT (COUNT(*) AS ?n) WHERE { SELECT DISTINCT ?s ?p ?o WHERE { $P } }"         # 1204 triples
q "SELECT ?c (COUNT(DISTINCT ?s) AS ?n) WHERE { $P } GROUP BY ?c"                     # las clases, abajo
q "SELECT (COUNT(*) AS ?n) WHERE { $P FILTER(isBlank(?o) || isBlank(?s)) }"           # 0 blank nodes
q "SELECT (COUNT(DISTINCT ?o) AS ?n) WHERE { $P FILTER(isIRI(?o) && ?p != rdf:type)
     FILTER NOT EXISTS { ?o a ?c2 } }"                                                # 0 aristas a algo sin clase
```

| Entra (instancias)                           | Se queda afuera                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `j:JobPost` 131, `k:Uso` 43, `k:Workflow` 21 | el esquema de domain/: `rdfs:Class`, `rdf:Property`, sus `rdfs:comment`        |
| `t:Technology` 15, `doap:Project` 15         | las shapes (`sh:NodeShape`) y sus blank nodes: venían de los `.ttl` de domain/ |
| `k:Action` 10                                | los nodos de named graph `urn:kiri-*`: sin tipo, metadata del grafo            |

Las 15 `t:Technology` vienen del default graph de producción: `domain/tecnologias.ttl` es A_MANO del servidor. Como todo
sale de la misma fuente que lee GET /jobs, la vista ya no puede tener datos que el servidor no ve (antes cargaba los 14
`.ttl` de domain/, más que los 6 A_MANO del servidor).

## Named graphs: aplanados a la unión

El servidor lee los campos de un puesto por la **unión** (`Dataset(default_union=True)`): las decisiones viven en sus
propios grafos (`urn:kiri-acciones:…`) y se ven igual. La vista hace lo mismo: un solo grafo, la unión.

- n10s sí importa quads: `n10s.experimental.quadrdf.import.fetch` (TriG y N-Quads) guarda el nombre del grafo como
  propiedad `graphUri` y crea **un nodo por (uri, grafo)** (`RDFQuadDirectStatementLoader.java`, tag 2025.06.1). Un
  `t:Python` que está en domain/ y es pedido desde el grafo de hn serían dos nodos, y leer por la unión obligaría a
  juntarlos por uri en cada consulta. Además `/sparql` no devuelve TriG: `CONSTRUCT` da triples.
- **Qué se pierde:** a qué grafo pertenece cada triple, y la metadata de cada grafo (`dct:source "kiri-jobs -j (hn)"`,
  `prov:generatedAtTime`, `rdfs:comment`): la URI del grafo no tiene `rdf:type`, así que `PATRON_DATOS` la deja afuera.
  No hace falta: cada puesto lleva su propia fuente (`dct__source: ["hn"]`) y su fecha.
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
- **Prefijos:** `PREFIJOS` (`j`, `t`, `k`, `doap`, `rdf`, `rdfs`, `skos`, `dct`, `prov`), registrados antes del fetch.
  `CALL n10s.nsprefixes.list()` da esos 9 y ninguno `nsN`. Un namespace nuevo en los datos que no esté ahí quedaría
  `ns0__`: se suma a `PREFIJOS`.
- **Literales:** propiedades del nodo, en listas. `xsd:string` → texto; `xsd:boolean` → booleano (`k__esPublico`);
  `xsd:dateTime` → `DateTime` de Neo4j con su offset. El motor lo vuelve a escribir como `isoformat()` de Python
  (`2026-10-13T21:03:57+00:00`, microsegundos solo si no son cero), que es lo que devuelve el servidor: `toString()` de
  Cypher daría `2026-10-13T21:03:57Z`. Un lexical escrito a mano con `Z` saldría `+00:00`: hoy todas las fechas las
  escribe Python.
- **Relaciones:** un triple con objeto IRI es una arista con el predicado acortado: `j__pide` 168, `k__accion` 43,
  `k__tieneUso` 43, `k__ejecutaEnCI` 31, `k__tieneWorkflow` 21, `k__alojadaEn` 10.
- **Blank nodes y listas RDF:** no hay. Vivían en las shapes, que ya no entran.

Nodos por label con el grafo cargado (`MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) ORDER BY count(*) DESC`):

```
Resource 235   j__JobPost 131   k__Uso 43   k__Workflow 21   doap__Project 15   t__Technology 15   k__Action 10
_Carga 1   _GraphConfig 1   _NsPrefDef 1
```

238 nodos y 316 relaciones. Cada `:Resource` tiene una clase (0 con un solo label), y no queda ningún `rdf__Property`,
`rdfs__Class`, `sh__NodeShape`, `dash__*`, `bnode://` ni `urn:`.

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
ok | 3 passed | 0 failed (8s)
```

Diferencias conocidas, ninguna presente en los datos de hoy: `fuente` se compara con `toLowerCase` y el servidor con
`casefold()` (difieren en letras como `ß`), y dos puestos con la misma fecha y el mismo título no tienen orden fijo en
ninguno de los dos lados.

**Solo lectura.** El motor lee en `executeRead`, en una sesión `READ`. Una escritura ahí la rechaza Neo4j (probado):
`Neo.ClientError.Statement.AccessMode: Writing in read access mode not allowed`.

## Memoria (medida el 2026-10-15)

| Config (`compose.yaml`)                                                               | Con el grafo cargado y 3 `jobs.get()`                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| igual, `mem_limit: 640m`, vista solo datos (238 nodos)                                | **387.2 MiB / 640 MiB** después de cargar, la paridad y `neo4j:hola` (2026-10-15T20:42:21Z); 0 reinicios                                                                       |
| igual, con `mem_limit: 640m`, vista con esquema (346 nodos)                           | **347.4 MiB / 640 MiB** después de un `MATCH (n)` sobre todo el grafo, el Browser abierto y `neo4j:hola`; 0 reinicios                                                          |
| heap 64m→96m, pagecache 16m, SerialGC, JIT solo C1, code cache 48m, `mem_limit: 448m` | OOM a las 19:30 UTC con dos clientes a la vez (`anon-rss: 454396kB`, dmesg). Sola: **360.7 MiB / 448 MiB** (en frío, recién arrancada: 259.9 MiB); antes de la revisión, 354.7 |
| heap 128m→160m, pagecache 16m, G1, `mem_limit: 384m`                                  | OOM durante la carga (`anon-rss: 389452kB`, dmesg)                                                                                                                             |
| heap 128m→192m, pagecache 32m, G1, `mem_limit: 512m`                                  | 453.9 MiB / 512 MiB                                                                                                                                                            |

```sh
ssh neo4j-ontology.exe.xyz 'docker stats --no-stream; free -m'
# después de: deno task neo4j:cargar … && deno task test tests/neo4j-paridad.test.ts
# 3dea15396d40 neo4j-neo4j-1  0.60%  387.2MiB / 640MiB  60.50%   (2026-10-15T20:42:21Z)
# Mem: total 7935  used 644  free 5665  (la VM entera)
```

Lo que pesa no es el grafo (238 nodos) sino la JVM: sacar el esquema no bajó la memoria.
`jcmd <pid> VM.native_memory summary` con `-XX:NativeMemoryTracking=summary`: metaspace ~109 MB y symbols ~53 MB (las
clases de Neo4j y n10s), heap el que se le dé, code cache ~26 MB; con G1, 41 MB más de GC (SerialGC: 0.4 MB). Con un
solo cliente cabe en 448m, pero un `MATCH (n)` con el Browser abierto pasó los 448m: 640m deja aire para el uso real.
Para un VPS, el número a reservar es ~640m.

`cypher-shell` dentro del container es otra JVM: con el límite ajustado, el container se reinicia. Las consultas a mano
van por el túnel con el driver.
