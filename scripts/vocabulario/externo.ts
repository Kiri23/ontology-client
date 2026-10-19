// externo.ts — un vocabulary.ttl de afuera del repo (el de Modal en el vault, el de exe…) a sus páginas markdown, con
// las mismas piezas que docs/vocabulary/: leer, validar, renderizar y el disco. Lo que cambia:
//
//   - el idioma sale del archivo: el de la mayoría de sus skos:prefLabel (en o es), y con él los títulos;
//   - el namespace sale de su skos:ConceptScheme, que tiene que ser uno (vocabulario-reglas.ttl de ontologyLearning:
//     cada archivo declara su esquema); su label y su definición encabezan el índice;
//   - los TTL de contexto (--context, como domain/ambiente.ttl) no llevan página: sus términos son destinos válidos
//     de broader y related, se nombran con su prefijo ("Entorno aislado (ambiente:)") y cuentan para Análogos;
//   - no hay "Mentioned in": eso es la prosa de este repo, que un vocabulario de afuera no tiene.
//
// `renderizarExterno` no toca el disco (los tests le pasan strings); `correrExterno` lee, compara y escribe. Como
// escribir borra lo que sobra en la carpeta de salida, se niega a tocar una que tenga archivos que este script no
// generó: un --out mal puesto (la carpeta del TTL, por ejemplo) no se lleva puesto nada.

// @ts-types="@types/n3"
import { type Quad, Store } from "n3";
import { conceptos as conceptosDe, esquemas, prefijos as prefijosDe, slugDe, triples } from "./leer.ts";
import { validar } from "./validar.ts";
import { type Idioma, renderizar, TEXTOS } from "./renderizar.ts";
import { comparar, escribir, leerDirectorio } from "./archivos.ts";

export interface Turtle {
  // Cómo se nombra el archivo en los mensajes.
  ruta: string;
  texto: string;
}

export type Resultado = { errores: string[] } | { archivos: Map<string, string>; terminos: number; idioma: Idioma };

// La primera línea de una página generada, en cualquier idioma: lo que no empieza así no lo escribió este script.
const MARCAS = ["<!-- Generated from ", "<!-- Generado desde "];

function parsear(t: Turtle): Quad[] | string {
  try {
    return triples(t.texto);
  } catch (e) {
    return `${t.ruta} no es Turtle válido: ${e instanceof Error ? e.message : e}`;
  }
}

// El idioma de la mayoría de los skos:prefLabel de los términos; empate → el primero en orden alfabético.
export function idiomaDe(quads: Quad[]): string {
  const cuenta = new Map<string, number>();
  for (const c of conceptosDe(quads)) {
    for (const l of c.prefLabel) cuenta.set(l.idioma, (cuenta.get(l.idioma) ?? 0) + 1);
  }
  return [...cuenta].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "";
}

// `vocabulario`: el TTL a renderizar. `fuente`: su ruta vista desde la carpeta de salida (link del índice y
// cabecera). `contexto`: los TTL cuyos términos se nombran pero no se renderizan.
export function renderizarExterno(vocabulario: Turtle, fuente: string, contexto: Turtle[] = []): Resultado {
  const parseados = [vocabulario, ...contexto].map(parsear);
  const malos = parseados.filter((p): p is string => typeof p === "string");
  if (malos.length) return { errores: malos };
  const [quads, ...deContexto] = parseados as Quad[][];

  const esquema = esquemas(quads);
  if (esquema.length !== 1) {
    return {
      errores: [`${vocabulario.ruta} tiene ${esquema.length} skos:ConceptScheme; tiene que declarar exactamente uno`],
    };
  }
  const idioma = idiomaDe(quads);
  if (!(idioma in TEXTOS)) {
    return { errores: [`${vocabulario.ruta} está en @${idioma || "(sin idioma)"}; se renderiza en @en o @es`] };
  }
  const t = TEXTOS[idioma as Idioma];
  const { iri } = esquema[0];
  const namespace = iri.slice(0, iri.length - slugDe(iri).length);
  const terminos = conceptosDe(quads);
  const otros = deContexto.flatMap((q) => conceptosDe(q).filter((c) => c.esConcepto && !c.enBlanco));
  const errores = validar(terminos, { namespace, idioma, contexto: otros });
  if (errores.length) return { errores: errores.map((e) => `${vocabulario.ruta}: ${e}`) };

  const prefijos = new Map([...contexto, vocabulario].flatMap((x) => [...prefijosDe(x.texto)]));
  const label = esquema[0].prefLabel.find((l) => l.idioma === idioma)?.valor ?? t.vocabulario;
  const definicion = esquema[0].definition.find((l) => l.idioma === idioma)?.valor;
  const verTambien = [...new Set(esquema[0].seeAlso.map((s) => s.valor))].sort().map((url) => `<${url}>`);
  const intro = [
    ...(definicion ? [definicion] : []),
    t.fuente(fuente) + (verTambien.length ? ` ${t.verTambien}: ${verTambien.join(", ")}.` : ""),
  ];
  const archivos = renderizar(terminos, new Store(), {
    idioma: idioma as Idioma,
    cabecera: t.cabecera(fuente),
    titulo: label,
    intro,
    contexto: otros,
    prefijos,
  });
  return { archivos, terminos: terminos.length, idioma: idioma as Idioma };
}

// Los archivos de la carpeta de salida que no generó este script, en orden.
export function ajenos(actual: Map<string, string>): string[] {
  return [...actual].filter(([, texto]) => !MARCAS.some((m) => texto.startsWith(m))).map(([n]) => n).sort();
}

// Una ruta de la línea de comandos como URL absoluta (relativa al directorio actual, `.` y `..` resueltos).
function aUrl(ruta: string, carpeta = false): URL {
  const url = new URL("file:///");
  url.pathname = (ruta.startsWith("/") ? ruta : `${Deno.cwd()}/${ruta}`) + (carpeta ? "/" : "");
  return url;
}

// El camino relativo de la carpeta `desde` al archivo `hacia`, con /: "../vocabulary.ttl".
export function relativa(desde: URL, hacia: URL): string {
  const a = desde.pathname.split("/").filter(Boolean);
  const b = hacia.pathname.split("/").filter(Boolean);
  let comun = 0;
  while (comun < a.length && comun < b.length - 1 && a[comun] === b[comun]) comun++;
  return decodeURIComponent([...a.slice(comun).map(() => ".."), ...b.slice(comun)].join("/"));
}

export interface Pedido {
  ttl: string;
  out: string;
  context: string[];
  check: boolean;
}

// Lo que corre `deno task vocabulario:externo`: 0 si está al día o se escribió, 1 si algo falla.
export async function correrExterno(p: Pedido): Promise<number> {
  const destino = aUrl(p.out, true);
  const leer = async (ruta: string) => ({ ruta, texto: await Deno.readTextFile(aUrl(ruta)) });
  let resultado: Resultado;
  let actual: Map<string, string>;
  try {
    resultado = renderizarExterno(
      await leer(p.ttl),
      relativa(destino, aUrl(p.ttl)),
      await Promise.all(p.context.map(leer)),
    );
    actual = await leerDirectorio(destino);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) console.error(`No existe: ${e.message}`);
    else if (e instanceof Deno.errors.NotCapable) {
      console.error(`Sin permiso: ${e.message}\nEl TTL, cada --context y --out van en VOCABULARIO_LEER.`);
    } else throw e;
    return 1;
  }
  if ("errores" in resultado) {
    console.error(`${resultado.errores.length} error(es):\n${resultado.errores.map((e) => `  ${e}`).join("\n")}`);
    return 1;
  }
  const extranos = ajenos(actual);
  if (extranos.length) {
    console.error(
      `${p.out} tiene archivos que no generó este script; elegí una carpeta vacía o solo con páginas generadas:\n${
        extranos.map((n) => `  ${n}`).join("\n")
      }`,
    );
    return 1;
  }
  const { archivos, terminos } = resultado;
  if (p.check) {
    const diferencias = comparar(actual, archivos, p.ttl);
    if (diferencias.length) {
      console.error(
        `${p.out} no coincide con ${p.ttl}: corré \`deno task vocabulario:externo\` sin --check.\n${
          diferencias.map((d) => `  ${d}`).join("\n")
        }`,
      );
      return 1;
    }
    console.log(`${p.out} está al día con ${p.ttl} (${terminos} términos).`);
    return 0;
  }
  try {
    await escribir(destino, actual, archivos);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotCapable)) throw e;
    console.error(`Sin permiso: ${e.message}\n--out va en VOCABULARIO_ESCRIBIR.`);
    return 1;
  }
  console.log(`${p.out} ← ${p.ttl} (${terminos} términos, contexto: ${p.context.join(", ") || "ninguno"})`);
  return 0;
}
