# Grafo de comprensión (prototipo)

## 1. Qué contesta y cómo se corre

**La pregunta:** ¿un grafo de arquitectura (quién importa a quién, qué rol tiene cada archivo, en qué PR nació) más uno
de comportamiento (qué líneas deciden "las formas de los nodos") te ayuda a entender el código que escriben los agentes?

Es un prototipo: se tira. No tiene tests ni pulido. El grafo guarda **índice, no significado**: rutas, líneas y shas. La
explicación la da quien pregunta, leyendo el archivo al que apunta la arista.

```sh
# el túnel al Neo4j del prototipo (otro contenedor, no la vista RDF): 7688 bolt, 7475 browser
setsid nohup ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 7688:localhost:7688 -L 7475:localhost:7475 neo4j-ontology.exe.xyz </dev/null >/dev/null 2>&1 & disown

# extraer → validar → cargar (en Termux: env -u LD_PRELOAD deno task --config deno.json proto:grafo)
doppler run -p ontology -c dev -- deno task proto:grafo
```

Abrí `http://localhost:7475/browser/`, conectate a `bolt://localhost:7688` con user `neo4j` y la password de Doppler
(`ontology/dev`, `NEO4J_PASSWORD`). Pegá las consultas de la sección 3.

| Archivo                      | Qué hace                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `extraer.ts`                 | git ls-files, imports, git log, gh y `roles.json` → `generado/grafo.json` (con los conteos impresos)      |
| `roles.json`                 | ruta → rol, por sistema, y la matriz `puede-servir-a`. **A mano: editalo vos**                            |
| `comportamientos.json`       | comportamiento → archivo y líneas que lo deciden (el juicio del agente)                                   |
| `validar-comportamientos.ts` | lo comprueba: el archivo existe, el rango cabe y el símbolo está en esas líneas. Exit 1 si algo falla     |
| `cargar.ts`                  | borra el 7688 y lo carga entero; se niega con `:7687` o con labels del RDF (`j__…`, `Resource`, `_Carga`) |

Cambiaste `roles.json` o `comportamientos.json` → corré la task de nuevo. Cada corrida rehace todo.

## 2. El modelo

Cada predicado existe porque habilita un recorrido que sin él no se puede hacer. Cada arista lleva **firma**: `fuente`
(qué la produjo) y `ancla` (`archivo:línea`, un sha o la clave de `roles.json`). En Neo4j el predicado va en
SCREAMING_SNAKE: `sirve-a` es `SIRVE_A`, `nació-en` es `NACIO_EN`, y así.

| Predicado (tipo en Neo4j)           | De → a                              | Firma                                              | El recorrido que habilita                                                |
| ----------------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `contiene` (`CONTIENE`)             | Sistema → Folder → Folder → Archivo | `git`, `git ls-files`                              | el mapa: bajar de un sistema a sus archivos                              |
| `tiene-rol` (`TIENE_ROL`)           | Archivo → Rol                       | `roles.json`, la clave que matcheó                 | agrupar por qué _hace_ un archivo, no por dónde está                     |
| `sirve-a` (`SIRVE_A`)               | B → A cuando **A importa B**        | `imports`, `archivo:línea` del import              | backtracking: qué necesita un archivo y a quién le rompo algo si lo toco |
| `nació-en` (`NACIO_EN`)             | Archivo → PR                        | `git`, sha del commit que lo agregó                | qué creó el agente en un PR                                              |
| `cambió-en` (`CAMBIO_EN`)           | Archivo → PR (uno por PR)           | `git`, sha del último commit de ese PR que lo toca | qué tocó el agente en un PR, además de lo que creó                       |
| `alias-de` (`ALIAS_DE`)             | Alias → Archivo                     | `deno.json`, `deno.json:línea`                     | resolver `@kiri23/ontology-client/neo4j` al archivo                      |
| `puede-servir-a` (`PUEDE_SERVIR_A`) | Rol → Rol                           | `roles.json`                                       | encontrar las `SIRVE_A` que van contra las capas                         |
| `lo-decide` (`LO_DECIDE`)           | Comportamiento → Archivo            | `comportamientos.json`, `ruta:L1-L2`, `simbolo`    | de "quiero que X se vea distinto" al archivo y las líneas                |

Nodos: `Sistema {nombre}` (SDK = todo lo que no es `explorador/`; Explorador), `Folder {ruta}` (`.` es la raíz del SDK),
`Archivo {ruta, sistema, intencion, lineas, commits, binario}`, `Rol {nombre}`,
`PR {numero, titulo, rama, mergeCommit}`, `Alias {nombre}`, `Comportamiento {nombre, descripcion, tipo, existe, nota}`.
`intencion` es la primera línea del archivo sin `//`, `#` ni el `nombre.ts —` del principio.

Lo que supuse, para que lo corrijas:

- **`SIRVE_A` lleva `soloTipos`** (`true` si es `import type` / `export type`). No es un predicado nuevo, es una
  propiedad de la firma. Sin ella el backtracking de `Nodo.tsx` cruza `Nodo.tsx:10` (`import type { Ir }` de
  `VistaGrafo.tsx`), que cierra un ciclo, y trae 53 archivos en vez de 13.
- **PRs:** `git log --first-parent --merges origin/main`; los commits del PR son `merge^1..merge^2`. Un commit directo a
  main va al PR `0` ("directo a main"), y uno que todavía no entró a main, al PR `-1` ("sin merge: <rama>"). Los títulos
  salen de `gh pr list`; si `gh` falla, el título es el nombre de la rama y `extraer.ts` lo avisa.
- **`cambió-en` no repite el PR de nacimiento:** los retoques dentro del PR que creó el archivo cuentan como su
  nacimiento.
- **`explorador/pruebas/` es `Tests`**, aunque el handoff solo mapeaba `explorador/src/`.
- **La matriz `puede-servir-a` es una PROPUESTA.** Tests y Ejemplos pueden importar cualquier cosa. "Sin rol" no se
  juzga. Lógica pura sirve a todos menos Fuente, Derivado e Infra. Vista no sirve a Lógica pura, Estado ni Motor.
  Componente no sirve a Lógica pura. Entrada sirve solo a Tests, Ejemplos y Catálogo, más dos agregados míos: a otra
  Entrada (`main.tsx` importa `App.tsx`) y a Superficie (`cli.ts` usa `mod.ts`, la API pública). Transporte sirve a
  Módulo, Motor, Superficie y Entrada. Fuente sirve solo a Derivado y Pipeline. Y Módulo **no** sirve a Motor: el motor
  está debajo de `jobs.ts`.
- **"¿Lógica no sirve hacia arriba?"** lo leí así: hacia arriba = hacia Vista y Componente, y eso **está permitido**. Lo
  que no puede pasar es lo contrario: que Vista o Componente le sirvan a Lógica pura. Si lo leés al revés, cambiá
  `roles.json` y recargá.

## 3. Consultas

Probadas contra la carga de HEAD `cf7d4ff` + esta guía. Debajo de cada una va lo que devolvió.

### Mapa

Gráfica: sistemas → folders → archivos → rol (sin Tests, Docs, Infra, Ejemplos ni "Sin rol", para que se lea).

```cypher
MATCH p = (:Sistema)-[:CONTIENE*]->(f:Archivo)-[:TIENE_ROL]->(r:Rol)
WHERE NOT r.nombre IN ['Sin rol', 'Tests', 'Docs', 'Infra', 'Ejemplos']
RETURN p LIMIT 120
```

> 87 caminos (todos los archivos con un rol "de código").

Tabular: cuántos archivos de cada rol hay en cada folder.

```cypher
MATCH (s:Sistema)-[:CONTIENE*]->(d:Folder)-[:CONTIENE]->(f:Archivo)-[:TIENE_ROL]->(r:Rol)
RETURN s.nombre AS sistema, d.ruta AS folder, r.nombre AS rol, count(f) AS archivos,
       collect(f.ruta)[..3] AS ejemplos
ORDER BY sistema, folder, rol
```

> 46 filas (folder × rol). Por ejemplo, `explorador/src/grafo` tiene 1 Motor (`motor.ts`) y 2 "Sin rol"
> (`VistaGrafo.tsx`, `colores.ts`).

### Backtracking de `explorador/src/grafo/vistas/Nodo.tsx`

Qué le sirve, transitivo, con la firma de cada import del camino más corto. Sin los imports de solo tipos:

```cypher
MATCH p = (b:Archivo)-[:SIRVE_A*1..8]->(:Archivo {ruta: 'explorador/src/grafo/vistas/Nodo.tsx'})
WHERE none(s IN relationships(p) WHERE s.soloTipos)
WITH b, p ORDER BY length(p)
WITH b, head(collect(p)) AS p
MATCH (b)-[:TIENE_ROL]->(r:Rol)
RETURN b.ruta AS archivo, r.nombre AS rol, length(p) AS saltos, [s IN relationships(p) | s.ancla] AS firmas
ORDER BY saltos, archivo
```

> 13 archivos: 5 a un salto (`Cuerpo`, `Ficha`, `Lienzo`, `Sparql` y `logica/camino.ts`) y 8 a dos (por ejemplo
> `logica/clases.ts` vía `Lienzo.tsx:7` → `Nodo.tsx:6`). Si borrás el `WHERE`, salen 53 archivos y caminos de hasta 8
> saltos: el `import type` de `Nodo.tsx:10` entra a `VistaGrafo.tsx`, y por ahí a todas las vistas, al catálogo y a
> `mod.ts`.

La misma cosa como dibujo:

```cypher
MATCH p = (:Archivo)-[:SIRVE_A*1..3]->(:Archivo {ruta: 'explorador/src/grafo/vistas/Nodo.tsx'})
WHERE none(s IN relationships(p) WHERE s.soloTipos)
RETURN p
```

> 18 caminos.

A quién sirve:

```cypher
MATCH (n:Archivo {ruta: 'explorador/src/grafo/vistas/Nodo.tsx'})-[s:SIRVE_A]->(a:Archivo)-[:TIENE_ROL]->(r:Rol)
RETURN a.ruta AS archivo, r.nombre AS rol, s.ancla AS firma
```

> 1: `explorador/src/grafo/VistaGrafo.tsx` ("Sin rol"), por `VistaGrafo.tsx:11`.

### ¿Qué hizo el agente en el PR #10?

```cypher
MATCH (:PR {numero: 10})<-[e:NACIO_EN|CAMBIO_EN]-(f:Archivo)-[:TIENE_ROL]->(r:Rol)
RETURN r.nombre AS rol, type(e) AS como, count(f) AS archivos, collect(f.ruta + ' — ' + f.intencion) AS que
ORDER BY rol, como
```

> 17 filas (rol × nació/cambió): 39 archivos nacieron y 25 cambiaron. Nacieron 10 de Lógica pura, 9 Componentes, las 4
> Vistas, el Motor `grafo/motor.ts`, `useGrafo.ts`, 2 estilos y, en el SDK, `sparql.ts` con su test y `preview.yml`. En
> el SDK cambiaron `mod.ts`, `deno.json` y `README.md`.

### Aristas que rompen `puede-servir-a`

```cypher
MATCH (b:Archivo)-[s:SIRVE_A]->(a:Archivo), (b)-[:TIENE_ROL]->(rb:Rol), (a)-[:TIENE_ROL]->(ra:Rol)
WHERE rb.nombre <> 'Sin rol' AND ra.nombre <> 'Sin rol' AND NOT (rb)-[:PUEDE_SERVIR_A]->(ra)
RETURN rb.nombre + ' → ' + ra.nombre AS regla, b.ruta AS sirve, a.ruta AS a, s.ancla AS firma,
       s.soloTipos AS soloTipos
ORDER BY regla
```

> 8:
>
> - Entrada → Estado ×2: `mod.ts` en `grafo/hooks/useGrafo.ts:3` y en `hooks/useLlamada.ts:5`
> - Entrada → Motor: `mod.ts` en `explorador/src/grafo/motor.ts:5`
> - Módulo → Motor ×2: `jobs.ts` en `motor.ts:12` y en `vista-neo4j.ts:18`, los dos de solo tipos
> - Catálogo → Lógica pura: `historias/index.ts` en `logica/ruta.ts:5`, de solo tipos
> - Fuente → Catálogo: `contrato/openapi.json` en `historias/cliente.ts:7`
> - Transporte → Pipeline: `cliente.ts` en `scripts/neo4j-cargar.ts:19`
>
> Las tres de `mod.ts` dicen lo mismo: el explorador consume el SDK por su Entrada. Si eso está bien, agregá Estado y
> Motor a `Entrada` en la matriz.

### "Quiero que los nodos sean puntos"

```cypher
MATCH (c:Comportamiento {nombre: 'Formas de los nodos'})-[d:LO_DECIDE]->(f:Archivo)-[:TIENE_ROL]->(r:Rol)
RETURN c.tipo AS tipoDeCambio, f.ruta AS archivo, d.ancla AS ancla, d.simbolo AS simbolo, r.nombre AS rol,
       f.intencion AS intencion
```

> 3, tipo de cambio **dato**: `grafo/logica/clases.ts:L26-L75` (`forma` en `ESTILOS_CLASE` y en el default `OTRA`),
> `grafo/componentes/Lienzo.tsx:L55-L55` (`shape: "data(forma)"`), `estilos/grafo.css:L200-L218` (la leyenda dibuja la
> forma con CSS). "Puntos" sería `forma: "ellipse"` y un `tamano` chico en la tabla. La leyenda copia la forma aparte,
> así que hay que cambiarla también.

Quién más se entera si tocás esos archivos:

```cypher
MATCH (:Comportamiento {nombre: 'Formas de los nodos'})-[:LO_DECIDE]->(f:Archivo)-[s:SIRVE_A]->(a:Archivo)
RETURN f.ruta AS decide, collect(a.ruta) AS loUsan, count(a) AS n
```

> `clases.ts` → 4 (Ficha, Leyenda, Mapa, Lienzo); `grafo.css` → 2; `Lienzo.tsx` → 5 (las cuatro vistas y su test).

Los diez comportamientos, con el que no existe:

```cypher
MATCH (c:Comportamiento)-[d:LO_DECIDE]->(f:Archivo)
RETURN c.nombre AS comportamiento, c.tipo AS tipo, c.existe AS existe, c.nota AS nota, collect(d.ancla) AS anclas
ORDER BY tipo, comportamiento
```

> 10 comportamientos con 24 anclas. "Hover sobre un nodo" sale con `existe: false`: apunta a `Lienzo.tsx:L172`, el único
> `cy.on("tap", …)`.

### Tus tres preguntas abiertas

**(a) ¿`motor.ts` debe conocer `JobPost`?**

```cypher
MATCH (j:Archivo {ruta: 'jobs.ts'})-[s:SIRVE_A]->(m:Archivo)-[:TIENE_ROL]->(rm:Rol {nombre: 'Motor'})
MATCH (j)-[:TIENE_ROL]->(rj:Rol)
OPTIONAL MATCH (m)-[vuelta:SIRVE_A]->(j)
RETURN j.ruta + ' (' + rj.nombre + ')' AS sirve, m.ruta + ' (' + rm.nombre + ')' AS a, s.ancla AS firma,
       s.soloTipos AS soloTipos, EXISTS { (rj)-[:PUEDE_SERVIR_A]->(rm) } AS permitido, vuelta.ancla AS firmaDeLaVuelta
```

> 2 filas. `jobs.ts` (Módulo) sirve a `motor.ts` (Motor) por `motor.ts:12`, solo tipos, no permitido. Y está la vuelta:
> `motor.ts` sirve a `jobs.ts` por `jobs.ts:18` (`motorActual`). Es un ciclo: la dependencia de código va de jobs a
> motor, y la de tipos, de motor a jobs. Lo mismo pasa con `vista-neo4j.ts:18`, sin vuelta.

**(b) ¿`src/logica` y `src/grafo/logica` son un rol o dos?** Hoy `roles.json` los pone a los dos en Lógica pura.

```cypher
MATCH (b:Archivo)-[s:SIRVE_A]->(a:Archivo)-[:TIENE_ROL]->(r:Rol)
WHERE b.ruta STARTS WITH 'explorador/src/logica/' OR b.ruta STARTS WITH 'explorador/src/grafo/logica/'
WITH CASE WHEN b.ruta STARTS WITH 'explorador/src/logica/' THEN 'src/logica' ELSE 'src/grafo/logica' END AS desde,
     CASE WHEN a.ruta STARTS WITH 'explorador/src/logica/' THEN 'src/logica'
          WHEN a.ruta STARTS WITH 'explorador/src/grafo/logica/' THEN 'src/grafo/logica'
          WHEN a.ruta STARTS WITH 'explorador/src/grafo/' THEN 'resto de src/grafo/'
          ELSE 'fuera de src/grafo/' END AS hacia, r, s
RETURN desde, hacia, count(s) AS aristas, collect(DISTINCT r.nombre) AS rolesQueSirve
ORDER BY desde, hacia
```

> 6 filas. `src/logica` sirve 2 veces a `src/grafo/logica` y `src/grafo/logica` no le sirve nunca a `src/logica`: la
> relación va en una sola dirección. `src/grafo/logica` sirve 13 veces adentro, 31 al resto de `grafo/` y 15 afuera (13
> son pruebas; las otras 2 son `logica/vistas.ts` → `App.tsx` y `Barra.tsx`). `src/logica` sirve 9 veces fuera de
> `grafo/` y 2 al resto de `grafo/`. Con estos datos, dos roles es defendible: uno es la lógica de la app y el otro, la
> del grafo.

**(c) ¿`src/grafo/` es un sub-sistema?** Cuántas `SIRVE_A` cruzan el borde y cuántas quedan adentro (sin contar
`explorador/pruebas/`):

```cypher
MATCH (b:Archivo)-[s:SIRVE_A]->(a:Archivo)
WITH b, a, s, b.ruta STARTS WITH 'explorador/src/grafo/' AS bAdentro, a.ruta STARTS WITH 'explorador/src/grafo/' AS aAdentro
WHERE (bAdentro OR aAdentro) AND NOT a.ruta STARTS WITH 'explorador/pruebas/'
RETURN CASE WHEN bAdentro AND aAdentro THEN 'adentro'
            WHEN bAdentro THEN 'sale: grafo/ sirve a afuera'
            ELSE 'entra: afuera sirve a grafo/' END AS borde,
       count(s) AS aristas, collect(b.ruta + ' → ' + a.ruta + ' @ ' + s.ancla)[..6] AS ejemplos
ORDER BY borde
```

> 92 adentro, 11 entran y 3 salen. Las 3 que salen: `VistaGrafo.tsx` → `App.tsx:13` (el `import()` perezoso) y
> `logica/vistas.ts` → `App.tsx:8` y `Barra.tsx:5`. Las que entran son el SDK (`mod.ts`), los estilos,
> `componentes/Tabla.tsx`, `logica/` y el catálogo. Un borde con 3 salidas se parece mucho a un sub-sistema.

## 4. Qué queda afuera y por qué

- **Externos:** `npm:`, `jsr:`, `react`, `oxigraph`, `cytoscape` no entran como nodos. El grafo es del repo, y un
  paquete no lo escribe el agente.
- **Matiz de un import:** `SIRVE_A` dice que A importa _algo_ de B, no qué símbolo. La firma (`archivo:línea`) lleva a
  la línea, y ahí se lee. `soloTipos` es el único matiz que entra, porque cambia el recorrido.
- **Significado:** ningún nodo explica nada. `intencion` es la primera línea tal cual (a veces corta a mitad de frase, o
  es un `{`). El "por qué" lo lee el LLM o la persona en el archivo al que apunta el ancla.
- **"Sin rol" (40):** la config y los docs de `explorador/`, la raíz del repo (README, deno.json…), `explorador/public/`
  y `explorador/scripts/`, este prototipo, y tres de código: `VistaGrafo.tsx` (15 `SIRVE_A`: lo más conectado sin rol),
  `colores.ts` y `ambiente.d.ts`. Se ven a propósito: asignales un rol en `roles.json` si lo tienen.
- **Imports por regex:** las líneas que empiezan con `//` o `*` no cuentan (los ejemplos en comentarios). Un `from "…"`
  dentro de un string de varias líneas podría colarse; solo entra si resuelve a un archivo de `git ls-files`.
- **Alias:** solo `deno.json` (`exports` e imports locales). `explorador/tsconfig.json` mapea `openapi-fetch` a
  `node_modules` (externo), y `vite.config.ts` no tiene `resolve.alias`.
