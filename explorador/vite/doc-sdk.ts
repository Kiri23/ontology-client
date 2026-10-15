// El JSDoc y la firma de cada función que exporta el SDK, leídos de su código con el compilador de TypeScript al
// buildear. La app los importa de `virtual:doc-sdk`: la descripción de una historia es la del SDK, no una copia que
// se desactualiza.
//
// Sigue los exports de ../mod.ts: las funciones de mod.ts, `export * as jobs from "./jobs.ts"` (jobs.get…) y
// `export { crearCliente } from "./cliente.ts"`. Las clases (ErrorServidor) y las constantes no son historias.
import ts from "typescript";
import type { Plugin } from "vite";

/** Lo que el explorador muestra de una función del SDK. */
export interface DocFuncion {
  /** El JSDoc tal cual, con `{@link X}` como `X` entre backticks. Vacío si no tiene. */
  descripcion: string;
  /** `jobs.get(filtros?: FiltrosJobs, opciones?: OpcionesJobs): Promise<JobPost[]>`, un parámetro por línea si es larga. */
  firma: string;
  /** El archivo del SDK donde vive: mod.ts, jobs.ts… */
  archivo: string;
}

/** Cada función exportada por mod.ts, por su nombre de acceso: "validarProyecto", "jobs.get". */
export type DocSdk = Record<string, DocFuncion>;

// La raíz del repo, como ruta: explorador/vite/doc-sdk.ts → ../../. Con texto y no con `new URL(…, import.meta.url)`:
// en vitest con happy-dom, URL es la del DOM falso y resuelve contra http://localhost.
const RAIZ_SDK = decodeURIComponent(import.meta.url.replace(/^file:\/\//, "")).replace(/explorador\/vite\/[^/]+$/, "");
const ID = "virtual:doc-sdk";

export function leerDocSdk(raiz: string = RAIZ_SDK): DocSdk {
  const leer = (archivo: string) => {
    const texto = ts.sys.readFile(raiz + archivo);
    if (texto === undefined) throw new Error(`doc-sdk: no puedo leer ${archivo}`);
    return ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true);
  };
  const doc: DocSdk = {};
  const agregar = (nombre: string, f: ts.FunctionDeclaration, archivo: string) => {
    doc[nombre] = { descripcion: jsdoc(f), firma: firma(nombre, f), archivo };
  };

  for (const s of leer("mod.ts").statements) {
    if (ts.isFunctionDeclaration(s) && s.name && exportada(s)) agregar(s.name.text, s, "mod.ts");
    if (!ts.isExportDeclaration(s) || s.isTypeOnly || !s.moduleSpecifier || !s.exportClause) continue;
    const archivo = (s.moduleSpecifier as ts.StringLiteral).text.replace(/^\.\//, "");
    const funciones = new Map(
      leer(archivo).statements
        .filter((f): f is ts.FunctionDeclaration => ts.isFunctionDeclaration(f) && !!f.name && exportada(f))
        .map((f) => [f.name!.text, f]),
    );
    if (ts.isNamespaceExport(s.exportClause)) {
      for (const [nombre, f] of funciones) agregar(`${s.exportClause.name.text}.${nombre}`, f, archivo);
    } else {
      for (const e of s.exportClause.elements) {
        const f = funciones.get((e.propertyName ?? e.name).text);
        if (f && !e.isTypeOnly) agregar(e.name.text, f, archivo);
      }
    }
  }
  return doc;
}

function exportada(f: ts.FunctionDeclaration): boolean {
  return !!f.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function jsdoc(f: ts.FunctionDeclaration): string {
  return ts.getJSDocCommentsAndTags(f)
    .filter(ts.isJSDoc)
    .map((d) => ts.getTextOfJSDocComment(d.comment) ?? "")
    .join("\n\n")
    .replace(/\{@link\s+([^}\s]+)\s*\}/g, "`$1`")
    .trim();
}

function firma(nombre: string, f: ts.FunctionDeclaration): string {
  const params = f.parameters.map((p) => {
    const opcional = p.questionToken || p.initializer ? "?" : "";
    return `${p.name.getText()}${opcional}: ${p.type?.getText() ?? "unknown"}`;
  });
  const devuelve = f.type ? `: ${f.type.getText()}` : "";
  const enUnaLinea = `${nombre}(${params.join(", ")})${devuelve}`;
  if (enUnaLinea.length <= 72) return enUnaLinea;
  return `${nombre}(\n${params.map((p) => `  ${p},`).join("\n")}\n)${devuelve}`;
}

/** El plugin de Vite: `import doc from "virtual:doc-sdk"` es el {@link DocSdk} del SDK de este repo. */
export function docSdk(): Plugin {
  return {
    name: "doc-sdk",
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return;
      for (const archivo of ["mod.ts", "jobs.ts", "cliente.ts"]) {
        this.addWatchFile(RAIZ_SDK + archivo);
      }
      return `export default ${JSON.stringify(leerDocSdk())};`;
    },
  };
}
