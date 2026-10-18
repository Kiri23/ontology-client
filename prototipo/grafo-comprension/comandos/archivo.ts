// archivo.ts — la ficha de un archivo: rol, intención, PRs, quién le sirve y a quién sirve (con la línea del import),
// y qué comportamientos decide. Todo con ancla; el significado se lee abriendo el archivo.

import { type Comando, sinRuta } from "../lib/comando.ts";
import { leer, resolverRuta } from "../lib/db.ts";

export const archivo: Comando = {
  nombre: "archivo",
  descripcion:
    "Ficha de un archivo del repo: rol, intención, PR donde nació y cambió, qué le sirve (sus imports, con " +
    "archivo:línea), a quién sirve (quién lo importa) y qué comportamientos decide. Acepta la ruta o su final (Nodo.tsx).",
  parametros: [{ nombre: "ruta", tipo: "string", descripcion: "ruta del archivo o su sufijo", requerido: true }],
  async correr(args, db) {
    const pedida = String(args.ruta ?? "");
    const rutas = await resolverRuta(db, pedida);
    if (rutas.length !== 1) return sinRuta(pedida, rutas);
    const ruta = rutas[0];
    const [f] = await leer(
      db,
      `MATCH (a:Archivo {ruta: $ruta})-[:TIENE_ROL]->(r:Rol)
       OPTIONAL MATCH (a)-[n:NACIO_EN]->(pn:PR)
       OPTIONAL MATCH (a)-[:CAMBIO_EN]->(pc:PR)
       RETURN a.sistema AS sistema, r.nombre AS rol, a.intencion AS intencion, a.lineas AS lineas, a.commits AS commits,
              pn.numero AS prNacio, pn.titulo AS tituloNacio, n.ancla AS shaNacio,
              collect(DISTINCT pc.numero + ' ' + pc.titulo) AS cambios`,
      { ruta },
    );
    const entrantes = await leer(
      db,
      `MATCH (b:Archivo)-[s:SIRVE_A]->(:Archivo {ruta: $ruta}), (b)-[:TIENE_ROL]->(rb:Rol)
       RETURN b.ruta AS ruta, rb.nombre AS rol, s.ancla AS ancla, s.soloTipos AS soloTipos ORDER BY ruta`,
      { ruta },
    );
    const salientes = await leer(
      db,
      `MATCH (:Archivo {ruta: $ruta})-[s:SIRVE_A]->(a:Archivo), (a)-[:TIENE_ROL]->(ra:Rol)
       RETURN a.ruta AS ruta, ra.nombre AS rol, s.ancla AS ancla, s.soloTipos AS soloTipos ORDER BY ruta`,
      { ruta },
    );
    const decide = await leer(
      db,
      `MATCH (c:Comportamiento)-[d:LO_DECIDE]->(:Archivo {ruta: $ruta})
       RETURN c.nombre AS nombre, c.tipo AS tipo, c.existe AS existe, d.ancla AS ancla, d.simbolo AS simbolo ORDER BY nombre`,
      { ruta },
    );
    const arista = (x: Record<string, unknown>) =>
      `  ${x.ruta} (${x.rol}) @ ${x.ancla}${x.soloTipos ? " [solo tipos]" : ""}`;
    const cambios = (f.cambios as string[]).filter(Boolean);
    return [
      `${ruta}  ·  ${f.sistema} / ${f.rol}  ·  ${f.lineas} líneas, ${f.commits} commits`,
      `intención: ${f.intencion || "(sin primera línea legible)"}`,
      `nació en PR #${f.prNacio} ${f.tituloNacio} @ ${String(f.shaNacio).slice(0, 7)}`,
      cambios.length ? `cambió en: ${cambios.map((c) => "#" + c).join("; ")}` : "cambió en: ningún otro PR",
      ``,
      `le sirven (${entrantes.length}; A importa B en la línea del ancla):`,
      ...(entrantes.length ? entrantes.map(arista) : ["  nada del repo"]),
      ``,
      `sirve a (${salientes.length}):`,
      ...(salientes.length ? salientes.map(arista) : ["  nadie lo importa"]),
      ...(decide.length
        ? [
          ``,
          `decide:`,
          ...decide.map((d) =>
            `  ${d.nombre} (${d.tipo}${d.existe === false ? ", NO EXISTE" : ""}) @ ${d.ancla} ${d.simbolo}`
          ),
        ]
        : []),
    ].join("\n");
  },
};
