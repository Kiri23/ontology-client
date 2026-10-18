// cargar.ts — PROTOTIPO: carga generado/grafo.json y comportamientos.json en el Neo4j del prototipo (7688), entero
// cada vez (borra y vuelve a cargar), e imprime qué quedó: nodos, aristas y las tres consultas clave.
//
//   doppler run -p ontology -c dev -- deno task proto:grafo      (extraer → validar → cargar)
//
// Se niega a tocar la vista RDF de producción: una NEO4J_URL que termina en :7687, o una base con labels del RDF
// (j__…, Resource, _Carga), corta antes de borrar nada.

import neo4j, { type Driver } from "neo4j-driver";
import { leerComportamientos, validar } from "./validar-comportamientos.ts";

const URL_NEO4J = Deno.env.get("NEO4J_URL") || "bolt://localhost:7688";
const LOTE = 500;
const CLAVE: Record<string, string> = {
  Sistema: "nombre",
  Folder: "ruta",
  Archivo: "ruta",
  Rol: "nombre",
  PR: "numero",
  Alias: "nombre",
  Comportamiento: "nombre",
};

type Clave = [string, string | number];
interface Arista {
  tipo: string;
  de: Clave;
  a: Clave;
  [prop: string]: unknown;
}
interface Grafo {
  head: string;
  nodos: Record<string, Record<string, unknown>[]>;
  aristas: Arista[];
}

// Los números enteros van como Integer de Neo4j, no como Float (el driver manda todo number como Float).
const enteros = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number.isInteger(v) ? neo4j.int(v as number) : v]));

async function q(driver: Driver, cypher: string, p: Record<string, unknown> = {}) {
  return (await driver.executeQuery(cypher, p)).records.map((r) => r.toObject());
}

async function guardaAntiProduccion(driver: Driver): Promise<void> {
  if (/:7687\/?$/.test(URL_NEO4J)) throw new Error(`${URL_NEO4J} es el puerto de la vista RDF de producción: no`);
  const labels = (await q(driver, "CALL db.labels() YIELD label RETURN label")).map((r) => r.label as string);
  const rdf = labels.filter((l) => l.startsWith("j__") || l.startsWith("Resource") || l.startsWith("_Carga"));
  if (rdf.length) throw new Error(`${URL_NEO4J} tiene labels del RDF (${rdf.join(", ")}): es la vista, no se borra`);
}

async function main(): Promise<void> {
  const comportamientos = leerComportamientos();
  const { fallos } = validar(comportamientos);
  if (fallos.length) {
    console.error(`cargar: comportamientos.json no valida, no cargo nada:\n  ${fallos.join("\n  ")}`);
    Deno.exit(1);
  }
  const grafo = JSON.parse(Deno.readTextFileSync(new URL("generado/grafo.json", import.meta.url))) as Grafo;

  // Capa 2: Comportamiento y LO_DECIDE, armados acá desde comportamientos.json.
  grafo.nodos.Comportamiento = comportamientos.map((c) => ({
    nombre: c.nombre,
    descripcion: c.descripcion,
    tipo: c.tipo,
    existe: c.existe ?? true,
    nota: c.nota ?? null,
  }));
  for (const c of comportamientos) {
    for (const { archivo, lineas: [desde, hasta], simbolo } of c["lo-decide"]) {
      grafo.aristas.push({
        tipo: "LO_DECIDE",
        de: ["Comportamiento", c.nombre],
        a: ["Archivo", archivo],
        fuente: "comportamientos.json",
        ancla: `${archivo}:L${desde}-L${hasta}`,
        simbolo,
      });
    }
  }

  const driver = neo4j.driver(
    URL_NEO4J,
    neo4j.auth.basic(Deno.env.get("NEO4J_USER") || "neo4j", Deno.env.get("NEO4J_PASSWORD") ?? ""),
    { disableLosslessIntegers: true },
  );
  try {
    await guardaAntiProduccion(driver);
    await q(driver, "MATCH (n) DETACH DELETE n");
    for (const [label, clave] of Object.entries(CLAVE)) {
      await q(
        driver,
        `CREATE CONSTRAINT ${label}_${clave} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${clave} IS UNIQUE`,
      );
    }
    for (const [label, filas] of Object.entries(grafo.nodos)) {
      for (let i = 0; i < filas.length; i += LOTE) {
        await q(driver, `UNWIND $filas AS f CREATE (n:${label}) SET n = f`, {
          filas: filas.slice(i, i + LOTE).map(enteros),
        });
      }
    }
    // Aristas por (tipo, label de origen, label de destino): Cypher no deja parametrizar labels ni tipos.
    const grupos = Object.groupBy(grafo.aristas, (a) => `${a.tipo}|${a.de[0]}|${a.a[0]}`);
    const perdidas: string[] = [];
    for (const [grupo, lista] of Object.entries(grupos)) {
      const [tipo, de, a] = grupo.split("|");
      for (let i = 0; i < lista!.length; i += LOTE) {
        const filas = lista!.slice(i, i + LOTE).map(({ tipo: _t, de: d, a: h, ...props }) => ({
          ...enteros({ de: d[1], a: h[1] }),
          props: enteros(props),
        }));
        const [{ n }] = await q(
          driver,
          `UNWIND $filas AS f MATCH (x:${de} {${CLAVE[de]}: f.de}) MATCH (y:${a} {${CLAVE[a]}: f.a})
           CREATE (x)-[r:${tipo}]->(y) SET r = f.props RETURN count(r) AS n`,
          { filas },
        );
        if (n !== filas.length) perdidas.push(`${grupo}: ${filas.length - (n as number)} sin un extremo`);
      }
    }
    await resumen(driver, grafo.head, perdidas);
  } finally {
    await driver.close();
  }
}

async function resumen(driver: Driver, head: string, perdidas: string[]): Promise<void> {
  console.log(`cargar: ${URL_NEO4J} (grafo de HEAD ${head.slice(0, 7)})`);
  for (const r of await q(driver, "MATCH (n) RETURN labels(n)[0] AS l, count(*) AS n ORDER BY l")) {
    console.log(`  nodo ${String(r.l).padEnd(15)} ${r.n}`);
  }
  for (const r of await q(driver, "MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS n ORDER BY t")) {
    console.log(`  arista ${String(r.t).padEnd(15)} ${r.n}`);
  }
  if (perdidas.length) console.log(`  AVISO aristas que no entraron: ${perdidas.join("; ")}`);

  const rompen = await q(
    driver,
    `MATCH (b:Archivo)-[s:SIRVE_A]->(a:Archivo), (b)-[:TIENE_ROL]->(rb:Rol), (a)-[:TIENE_ROL]->(ra:Rol)
     WHERE rb.nombre <> 'Sin rol' AND ra.nombre <> 'Sin rol' AND NOT (rb)-[:PUEDE_SERVIR_A]->(ra)
     RETURN b.ruta AS de, rb.nombre AS rolDe, a.ruta AS a, ra.nombre AS rolA, s.ancla AS ancla ORDER BY de, a`,
  );
  console.log(`  [1] SIRVE_A que rompen PUEDE_SERVIR_A: ${rompen.length}`);
  for (const r of rompen) console.log(`      ${r.de} (${r.rolDe}) → ${r.a} (${r.rolA}) @ ${r.ancla}`);

  const sinRol = await q(
    driver,
    "MATCH (f:Archivo)-[:TIENE_ROL]->(:Rol {nombre: 'Sin rol'}) RETURN f.ruta AS r ORDER BY r",
  );
  console.log(`  [2] archivos "Sin rol": ${sinRol.length}`);
  console.log(`      ${sinRol.map((r) => r.r).join(", ")}`);

  const comp = await q(
    driver,
    `MATCH (c:Comportamiento)-[d:LO_DECIDE]->(f:Archivo)
     RETURN c.nombre AS c, c.tipo AS tipo, c.existe AS existe, collect(d.ancla) AS anclas ORDER BY c`,
  );
  console.log(`  [3] comportamientos: ${comp.length}`);
  for (const r of comp) {
    console.log(`      ${r.c} (${r.tipo}${r.existe ? "" : ", NO EXISTE"}) → ${(r.anclas as string[]).join(", ")}`);
  }
}

if (import.meta.main) await main();
