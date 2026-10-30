// todos.ts — `deno task vocabulario:todos <carpeta>…`: las páginas de cada vocabulario externo, todas de una vez, con
// el mismo contexto para todas: cada vocabulario de las raíces de ontologyLearning (raices.json).
//
// Por qué todas juntas: la página de un término depende de los otros vocabularios. Análogos son los términos con el
// mismo broader en cualquier vocabulario, Narrower y Related también se calculan desde el otro lado. Si cada
// vocabulario se genera con un --context elegido a mano, agregar uno (remark, que comparte padre con pandoc) deja
// viejas las páginas de sus hermanos, y nadie las regenera. Acá el contexto sale de los datos y es uno solo:
//
//   - contexto: todos los *.ttl que declaran `a skos:ConceptScheme` (o `a ontologia:VocabularioCompartido`) bajo las
//     raíces de raices.json: los mismos archivos que ontologyLearning junta en grafo:vocabulario (core/scanner.py
//     encontrar + core/vocabularios.py los_que_son_vocabulario, con las mismas carpetas podadas);
//   - páginas: cada uno de esos que se llama vocabulary.ttl y vive bajo una <carpeta> de la línea de comandos, en la
//     carpeta vocabulary/ de al lado. Un vocabulario nuevo es crear el archivo: la tarea lo encuentra sola.
//
// Cada vocabulario pasa por correrExterno, el mismo camino que `vocabulario:externo`: valida, compara, escribe y se
// niega a pisar una carpeta con archivos ajenos.

import { correrExterno } from "./externo.ts";
import { esquemas, triples } from "./leer.ts";

const ONTOLOGIA_COMPARTIDO = "https://kiri231.com/ontologia#VocabularioCompartido";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

// Las carpetas que core/scanner.py no recorre (PODAR y CON_PUNTO_QUE_SI): si cambian allá, cambian acá.
const PODAR = new Set(["node_modules", "SourceCode", "worktrees", "dist", "tests", "fixtures"]);
const CON_PUNTO_QUE_SI = new Set([".claude"]);
const sePoda = (carpeta: string) => PODAR.has(carpeta) || (carpeta.startsWith(".") && !CON_PUNTO_QUE_SI.has(carpeta));

export interface Raiz {
  nombre: string;
  ruta: string;
}

// Una ruta con ~ y relativa a `base` → absoluta.
function absoluta(ruta: string, base: string, home: string): string {
  const expandida = ruta === "~" || ruta.startsWith("~/") ? home + ruta.slice(1) : ruta;
  return expandida.startsWith("/") ? expandida : `${base}/${expandida}`;
}

// Las raíces de raices.json: cada objeto necesita `nombre` y `ruta` (core/scanner.py valida el resto).
export async function leerRaices(archivo: string, home: string): Promise<Raiz[]> {
  const datos = JSON.parse(await Deno.readTextFile(archivo));
  if (!Array.isArray(datos)) throw new Error(`${archivo} tiene que ser una lista de objetos, uno por repo`);
  const base = archivo.slice(0, Math.max(archivo.lastIndexOf("/"), 0)) || ".";
  return datos.map((e, i) => {
    if (typeof e?.nombre !== "string" || typeof e?.ruta !== "string") {
      throw new Error(`${archivo}: a la entrada ${i + 1} le falta nombre o ruta`);
    }
    return { nombre: e.nombre, ruta: absoluta(e.ruta, base, home) };
  });
}

// Todos los *.ttl bajo `carpeta` (ya resuelta), sin bajar a lo que se poda ni seguir symlinks, como os.walk.
async function ttlBajo(carpeta: string, encontrados: Set<string>): Promise<void> {
  for await (const e of Deno.readDir(carpeta)) {
    if (e.isDirectory && !sePoda(e.name)) await ttlBajo(`${carpeta}/${e.name}`, encontrados);
    else if (e.isFile && e.name.endsWith(".ttl")) encontrados.add(`${carpeta}/${e.name}`);
  }
}

// Si el texto declara un vocabulario. Un .ttl que no parsea no es vocabulario: se devuelve el error para avisarlo.
export function esVocabulario(texto: string): boolean | string {
  try {
    const quads = triples(texto);
    return esquemas(quads).length > 0 ||
      quads.some((q) => q.predicate.value === RDF_TYPE && q.object.value === ONTOLOGIA_COMPARTIDO);
  } catch (e) {
    return e instanceof Error ? e.message.split("\n")[0] : String(e);
  }
}

export interface Hallazgo {
  // Los vocabularios, rutas reales y ordenadas.
  vocabularios: string[];
  // Las raíces que no están en esta máquina y los .ttl que no parsean: se avisan, no frenan.
  avisos: string[];
}

// Los vocabularios bajo `carpetas` (las raíces y las carpetas de páginas), cada archivo una vez aunque se llegue por
// un symlink (~/storage/documents/Secondbrain en la Mac).
export async function buscarVocabularios(carpetas: string[]): Promise<Hallazgo> {
  const encontrados = new Set<string>();
  const avisos: string[] = [];
  for (const c of carpetas) {
    let real;
    try {
      real = await Deno.realPath(c);
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
      avisos.push(`no está en esta máquina: ${c}`);
      continue;
    }
    await ttlBajo(real, encontrados);
  }
  const vocabularios: string[] = [];
  for (const ruta of [...encontrados].sort()) {
    const es = esVocabulario(await Deno.readTextFile(ruta));
    if (es === true) vocabularios.push(ruta);
    else if (typeof es === "string") avisos.push(`no es Turtle, no entra al contexto: ${ruta}: ${es}`);
  }
  return { vocabularios, avisos };
}

export interface PedidoTodos {
  carpetas: string[];
  raices: string;
  check: boolean;
}

// Lo que corre `deno task vocabulario:todos`: 0 si todos están al día o se escribieron, 1 si alguno falla.
export async function correrTodos(p: PedidoTodos): Promise<number> {
  let raices: Raiz[];
  try {
    raices = await leerRaices(p.raices, Deno.env.get("HOME") ?? "");
  } catch (e) {
    console.error(`No pude leer las raíces ${p.raices}: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
  const paginas: string[] = [];
  for (const c of p.carpetas) {
    try {
      paginas.push(await Deno.realPath(c));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
      console.error(`No existe: ${c}`);
      return 1;
    }
  }
  const { vocabularios, avisos } = await buscarVocabularios([...raices.map((r) => r.ruta), ...paginas]);
  for (const a of avisos) console.error(`aviso: ${a}`);
  const conPaginas = vocabularios.filter((v) =>
    v.endsWith("/vocabulary.ttl") && paginas.some((c) => v.startsWith(`${c}/`))
  );
  if (!conPaginas.length) {
    console.error(`Ningún vocabulary.ttl con un skos:ConceptScheme bajo ${p.carpetas.join(", ")}.`);
    return 1;
  }
  console.log(`Contexto: ${vocabularios.length} vocabularios de ${p.raices}; páginas de ${conPaginas.length}.`);
  let fallaron = 0;
  for (const ttl of conPaginas) {
    const codigo = await correrExterno({
      ttl,
      out: ttl.slice(0, -".ttl".length),
      context: vocabularios.filter((v) => v !== ttl),
      check: p.check,
      contextoEnMensaje: `los otros ${vocabularios.length - 1}`,
      tarea: "vocabulario:todos",
    });
    if (codigo !== 0) fallaron++;
  }
  if (fallaron) console.error(`${fallaron} de ${conPaginas.length} vocabularios no están al día o no validan.`);
  return fallaron ? 1 : 0;
}
