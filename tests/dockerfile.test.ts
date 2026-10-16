// explorador/Dockerfile copia el SDK con una lista fija (`COPY mod.ts cliente.ts … ./`). Un archivo nuevo del SDK que
// no está en la lista rompe el build de la imagen, y en Termux no se puede construir para darse cuenta: pasó con
// sparql.ts y con motor.ts. Este test junta lo que el explorador importa de fuera de explorador/ (y lo que eso importa,
// transitivo) y comprueba que cada archivo esté en algún COPY de la etapa `construir`.
//
// Por qué una lista y no `COPY *.ts ./`: en la raíz hay .ts que el explorador no usa (cli.ts, neo4j.ts, vista-neo4j.ts)
// y que traen dependencias que la etapa de node no tiene; la lista dice qué entra en la imagen y este test la vigila.

import { assertEquals } from "@std/assert";

// Rutas absolutas POSIX, armadas con URL: deno.lock está congelado y no trae @std/path.
const ruta = (url: URL) => decodeURIComponent(url.pathname);
const resolver = (desde: string, especificador: string) => ruta(new URL(especificador, `file://${desde}`));
const RAIZ = ruta(new URL("..", import.meta.url));
const EXPLORADOR = RAIZ + "explorador";
const CODIGO = /\.(ts|tsx|mts|mjs|js)$/;
// `import … from "x"`, `export … from "x"`, `import "x"`, `import("x")`.
const ESPECIFICADOR = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

const existe = (ruta: string) => {
  try {
    return Deno.statSync(ruta).isFile;
  } catch {
    return false;
  }
};

/** Los imports relativos de un archivo, como rutas absolutas que existen (sin extensión: .ts, .tsx o index.ts). */
function importsLocales(archivo: string): string[] {
  const texto = Deno.readTextFileSync(archivo);
  const rutas: string[] = [];
  for (const [, especificador] of texto.matchAll(ESPECIFICADOR)) {
    if (!especificador.startsWith(".")) continue;
    const base = resolver(archivo, especificador);
    const encontrada = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existe);
    if (encontrada) rutas.push(encontrada);
  }
  return rutas;
}

function* fuentesDelExplorador(dir: string): Generator<string> {
  for (const entrada of Deno.readDirSync(dir)) {
    if (entrada.name === "node_modules" || entrada.name === "dist") continue;
    const hijo = `${dir}/${entrada.name}`;
    if (entrada.isDirectory) yield* fuentesDelExplorador(hijo);
    else if (CODIGO.test(entrada.name)) yield hijo;
  }
}

/** Los archivos de fuera de explorador/ que necesita el explorador, relativos a la raíz: "mod.ts", "generado/api.ts"… */
function archivosDeLaRaiz(): string[] {
  const fuera = new Set<string>();
  const pendientes = [...fuentesDelExplorador(EXPLORADOR)].flatMap(importsLocales);
  while (pendientes.length > 0) {
    const archivo = pendientes.pop()!;
    if (archivo.startsWith(EXPLORADOR + "/") || fuera.has(archivo)) continue;
    fuera.add(archivo);
    if (CODIGO.test(archivo)) pendientes.push(...importsLocales(archivo));
  }
  return [...fuera].map((archivo) => archivo.slice(RAIZ.length)).sort();
}

/** Las fuentes de los COPY de la etapa `construir`: "mod.ts", "generado", "explorador"… */
function copiasDelDockerfile(dockerfile: string): string[] {
  const etapa = dockerfile.split(/^FROM\s/m).find((e) => /\bAS\s+construir\b/i.test(e.split("\n")[0])) ?? "";
  return etapa
    .split("\n")
    .filter((linea) => /^COPY\s/i.test(linea))
    .flatMap((linea) => linea.trim().split(/\s+/).slice(1, -1))
    .filter((arg) => !arg.startsWith("--"))
    .map((fuente) => fuente.replace(/^\.\//, "").replace(/\/$/, ""));
}

Deno.test("Dockerfile: la etapa construir copia cada archivo de la raíz que importa el explorador", () => {
  const copias = copiasDelDockerfile(Deno.readTextFileSync(`${EXPLORADOR}/Dockerfile`));
  const necesarios = archivosDeLaRaiz();
  const faltan = necesarios.filter((archivo) => !copias.some((c) => archivo === c || archivo.startsWith(c + "/")));
  assertEquals(
    faltan,
    [],
    `explorador/Dockerfile no copia ${faltan.join(", ")}: sumalo al COPY del SDK. El explorador lo importa ` +
      `(directo o a través de mod.ts) y sin él falla el build de la imagen.`,
  );
});

Deno.test("Dockerfile: el recorrido encuentra el SDK (si no, el test de arriba pasaría sin mirar nada)", () => {
  const necesarios = archivosDeLaRaiz();
  for (const archivo of ["mod.ts", "cliente.ts", "jobs.ts", "motor.ts", "generado/api.ts"]) {
    assertEquals(necesarios.includes(archivo), true, `el recorrido no llegó a ${archivo}: ${necesarios.join(", ")}`);
  }
});
