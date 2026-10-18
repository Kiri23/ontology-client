// extraer.ts — PROTOTIPO: arma la capa de arquitectura del grafo de comprensión desde git, imports y roles.json.
// Escribe generado/grafo.json (nodos y aristas, cada arista con su firma: fuente + ancla) e imprime los conteos.
//
//   env -u LD_PRELOAD deno run --config deno.json --allow-read --allow-write=prototipo/grafo-comprension/generado \
//     --allow-run=git,gh prototipo/grafo-comprension/extraer.ts      (o todo junto: deno task proto:grafo)
//
// Índice, no significado: cada nodo guarda punteros (ruta, línea, sha) y la primera línea del archivo como intención.

const ruta = (url: URL) => decodeURIComponent(url.pathname);
const RAIZ = ruta(new URL("../../", import.meta.url));
const AQUI = new URL("./", import.meta.url);
const SALIDA = new URL("generado/grafo.json", AQUI);
const CODIGO = /\.(ts|tsx|mts|mjs|js)$/;
const REPO = "Kiri23/ontology-client";

type Clave = [label: string, clave: string | number];
interface Arista {
  tipo: string;
  de: Clave;
  a: Clave;
  fuente: string;
  ancla: string;
  [prop: string]: unknown;
}

async function correr(cmd: string, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command(cmd, { args, cwd: RAIZ }).output();
  if (code !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`);
  return new TextDecoder().decode(stdout);
}

// ---------- archivos ----------
const archivos = (await correr("git", ["ls-files"])).split("\n").filter(Boolean);
const existe = new Set(archivos);
const sistemaDe = (r: string) => (r.startsWith("explorador/") ? "Explorador" : "SDK");

function leer(r: string): { texto: string | null } {
  const bytes = Deno.readFileSync(RAIZ + r);
  if (bytes.subarray(0, 8000).includes(0)) return { texto: null };
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { texto: null };
  }
}

function intencion(texto: string): string {
  const primera =
    texto.split("\n").map((l) => l.trim()).find((l) =>
      l !== "" && !l.startsWith("#!") && !l.startsWith("/// <reference")
    ) ?? "";
  const limpia = primera
    .replace(/^(\/\/+|#+|<!--|\/\*+|\*+)\s*/, "")
    .replace(/\s*(-->|\*\/)\s*$/, "")
    .replace(/^[\w./@-]+\.\w+\s+—\s+/, "");
  return limpia.length > 160 ? limpia.slice(0, 159) + "…" : limpia;
}

// ---------- git: commits, PRs ----------
interface PR {
  numero: number;
  titulo: string;
  rama: string;
  mergeCommit: string;
}
const prs = new Map<number, PR>();
const prDeCommit = new Map<string, number>();

let titulos = new Map<number, { titulo: string; rama: string }>();
let ghFallo = "";
try {
  const lista = JSON.parse(
    await correr("gh", [
      "pr",
      "list",
      "-R",
      REPO,
      "--state",
      "merged",
      "--limit",
      "100",
      "--json",
      "number,title,mergeCommit,headRefName",
    ]),
  ) as { number: number; title: string; headRefName: string }[];
  titulos = new Map(lista.map((p) => [p.number, { titulo: p.title, rama: p.headRefName }]));
} catch (e) {
  ghFallo = String(e).split("\n")[0];
}

// Todos los merges, no solo los de la primera línea de main: un PR apilado (#18 se mergeó dentro de la rama de #17)
// tiene su merge fuera de --first-parent. Del más viejo al más nuevo y "el primero gana": el PR interno reclama sus
// commits antes de que el PR base los vea en su rango merge^1..merge^2.
const merges = (await correr("git", ["log", "--merges", "--topo-order", "--reverse", "origin/main", "--format=%H %s"]))
  .split("\n").filter(Boolean);
for (const linea of merges) {
  const [sha, ...resto] = linea.split(" ");
  const m = resto.join(" ").match(/^Merge pull request #(\d+) from [^/]+\/(\S+)/);
  if (!m) continue;
  const numero = Number(m[1]);
  const t = titulos.get(numero);
  prs.set(numero, { numero, titulo: t?.titulo ?? m[2], rama: t?.rama ?? m[2], mergeCommit: sha });
  for (const c of (await correr("git", ["rev-list", `${sha}^1..${sha}^2`])).split("\n").filter(Boolean)) {
    if (!prDeCommit.has(c)) prDeCommit.set(c, numero);
  }
}
prs.set(0, { numero: 0, titulo: "directo a main", rama: "main", mergeCommit: "" });
for (const c of (await correr("git", ["rev-list", "--first-parent", "--no-merges", "origin/main"])).split("\n")) {
  if (c && !prDeCommit.has(c)) prDeCommit.set(c, 0);
}
const rama = (await correr("git", ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
// Lo que está en HEAD y todavía no entró a main: un PR ficticio -1, para que estos archivos no queden sin origen.
prs.set(-1, { numero: -1, titulo: `sin merge: ${rama}`, rama, mergeCommit: "" });

// Del más nuevo al más viejo: (sha, [status, ruta][]).
const historia: { sha: string; cambios: [string, string][] }[] = [];
for (
  const bloque of (await correr("git", ["log", "HEAD", "--no-merges", "--no-renames", "--name-status", "--format=@%H"]))
    .split("@").filter((b) => b.trim())
) {
  const [sha, ...lineas] = bloque.trim().split("\n");
  historia.push({
    sha,
    cambios: lineas.filter(Boolean).map((l) => l.split("\t") as [string, string]),
  });
}

const nacio = new Map<string, string>(); // ruta → sha del último "A" (la encarnación actual)
const tocaron = new Map<string, string[]>(); // ruta → shas, del más viejo al más nuevo
for (const { sha, cambios } of [...historia].reverse()) {
  for (const [status, r] of cambios) {
    if (!existe.has(r)) continue;
    if (status === "A") {
      nacio.set(r, sha);
      tocaron.set(r, []);
    }
    (tocaron.get(r) ?? tocaron.set(r, []).get(r)!).push(sha);
  }
}
const pr = (sha: string) => prDeCommit.get(sha) ?? -1;

// ---------- roles.json ----------
interface Roles {
  sistemas: Record<string, { base: string; patrones: Record<string, string> }>;
  "puede-servir-a": Record<string, string[] | string>;
}
const roles = JSON.parse(Deno.readTextFileSync(new URL("roles.json", AQUI))) as Roles;
function rolDe(r: string): { rol: string; ancla: string } {
  const s = sistemaDe(r);
  const { base, patrones } = roles.sistemas[s];
  if (!r.startsWith(base)) return { rol: "Sin rol", ancla: `roles.json: ${s} (ninguna clave)` };
  const resto = r.slice(base.length);
  const clave = Object.keys(patrones)
    .filter((k) => (k.endsWith("/") ? resto.startsWith(k) : resto === k))
    .sort((a, b) => b.length - a.length)[0];
  return clave
    ? { rol: patrones[clave], ancla: `roles.json: ${s} › ${clave}` }
    : { rol: "Sin rol", ancla: `roles.json: ${s} (ninguna clave)` };
}

// ---------- alias (deno.json exports e imports locales) ----------
const aliases = new Map<string, { archivo: string; ancla: string }>();
{
  const lineas = Deno.readTextFileSync(RAIZ + "deno.json").split("\n");
  const json = JSON.parse(lineas.join("\n"));
  const nombre: string = json.name;
  const lineaDe = (k: string, v: string) => lineas.findIndex((l) => l.includes(`"${k}"`) && l.includes(`"${v}"`)) + 1;
  for (const [k, v] of Object.entries(json.exports as Record<string, string>)) {
    const alias = k === "." ? nombre : `${nombre}/${k.replace(/^\.\//, "")}`;
    aliases.set(alias, { archivo: v.replace(/^\.\//, ""), ancla: `deno.json:${lineaDe(k, v)}` });
  }
  for (const [k, v] of Object.entries(json.imports as Record<string, string>)) {
    if (v.startsWith("./")) aliases.set(k, { archivo: v.slice(2), ancla: `deno.json:${lineaDe(k, v)}` });
  }
  // explorador/tsconfig.json paths solo apunta a node_modules (externo) y vite.config.ts no tiene resolve.alias.
}

// ---------- imports → sirve-a ----------
const ESPECIFICADOR = /(?:\bfrom|^\s*import|\bimport\s*\()\s*\(?\s*["']([^"']+)["']/g;
function resolverImport(desde: string, esp: string): string | null {
  const limpio = esp.replace(/\?.*$/, "");
  if (aliases.has(limpio)) return aliases.get(limpio)!.archivo;
  if (!limpio.startsWith(".")) return null; // externo: npm:, jsr:, react, oxigraph…
  const base = ruta(new URL(limpio, `file:///${desde}`)).slice(1);
  const candidatos = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  if (base.endsWith(".js")) candidatos.push(base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"));
  return candidatos.find((c) => existe.has(c)) ?? null;
}

const aristas: Arista[] = [];
const nodosArchivo: Record<string, unknown>[] = [];
const sinResolver: string[] = [];
for (const r of archivos) {
  const { texto } = leer(r);
  const binario = texto === null;
  nodosArchivo.push({
    ruta: r,
    sistema: sistemaDe(r),
    intencion: binario ? "" : intencion(texto),
    lineas: binario ? null : texto.split("\n").length - (texto.endsWith("\n") ? 1 : 0),
    commits: tocaron.get(r)?.length ?? 0,
    binario,
  });
  const rol = rolDe(r);
  aristas.push({ tipo: "TIENE_ROL", de: ["Archivo", r], a: ["Rol", rol.rol], fuente: "roles.json", ancla: rol.ancla });

  if (!binario && CODIGO.test(r)) {
    const todas = texto.split("\n");
    // `import type …` / `export type …`: solo tipos, se borra al compilar. Un import de varias líneas se mira en la
    // línea donde arranca la sentencia.
    const soloTipos = (i: number) => {
      if (r.endsWith(".d.ts")) return true; // un .d.ts se borra entero al compilar
      if (/\bimport\s*\(/.test(todas[i])) return false; // import() dinámico: trae código
      let j = i;
      while (j > 0 && i - j < 40 && !/^\s*(import|export)\b/.test(todas[j])) j--;
      return /^\s*(import|export)\s+type\b/.test(todas[j]);
    };
    todas.forEach((linea, i) => {
      const t = linea.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      for (const [, esp] of linea.matchAll(ESPECIFICADOR)) {
        const destino = resolverImport(r, esp);
        if (destino === null) {
          if (esp.startsWith(".")) sinResolver.push(`${r}:${i + 1} ${esp}`);
          continue;
        }
        const props: Record<string, unknown> = { soloTipos: soloTipos(i) };
        if (aliases.has(esp)) props.alias = esp;
        aristas.push({
          tipo: "SIRVE_A",
          de: ["Archivo", destino],
          a: ["Archivo", r],
          fuente: "imports",
          ancla: `${r}:${i + 1}`,
          ...props,
        });
      }
    });
  }

  // nació-en / cambió-en
  const shas = tocaron.get(r) ?? [];
  const nacimiento = nacio.get(r);
  if (nacimiento) {
    aristas.push({ tipo: "NACIO_EN", de: ["Archivo", r], a: ["PR", pr(nacimiento)], fuente: "git", ancla: nacimiento });
  }
  const porPr = new Map<number, string[]>();
  for (const sha of shas) {
    if (sha === nacimiento) continue;
    const n = pr(sha);
    if (nacimiento && n === pr(nacimiento)) continue; // los retoques dentro del PR que lo creó son parte del nacimiento
    (porPr.get(n) ?? porPr.set(n, []).get(n)!).push(sha);
  }
  for (const [n, lista] of porPr) {
    aristas.push({
      tipo: "CAMBIO_EN",
      de: ["Archivo", r],
      a: ["PR", n],
      fuente: "git",
      ancla: lista[lista.length - 1],
      commits: lista,
    });
  }
}

// ---------- carpetas, sistemas ----------
const carpetas = new Set<string>(["."]);
const padre = (r: string) => (r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : ".");
for (const r of archivos) {
  for (let p = padre(r); p !== "."; p = padre(p)) carpetas.add(p);
}
const contiene = (de: Clave, a: Clave): Arista => ({
  tipo: "CONTIENE",
  de,
  a,
  fuente: "git",
  ancla: "git ls-files",
});
aristas.push(
  contiene(["Sistema", "SDK"], ["Folder", "."]),
  contiene(["Sistema", "Explorador"], ["Folder", "explorador"]),
);
for (const c of carpetas) {
  if (c !== "." && c !== "explorador") aristas.push(contiene(["Folder", padre(c)], ["Folder", c]));
}
for (const r of archivos) aristas.push(contiene(["Folder", padre(r)], ["Archivo", r]));

// ---------- alias-de, puede-servir-a ----------
for (const [nombre, { archivo, ancla }] of aliases) {
  aristas.push({ tipo: "ALIAS_DE", de: ["Alias", nombre], a: ["Archivo", archivo], fuente: "deno.json", ancla });
}
const nombresRol = new Set<string>(["Sin rol"]);
for (const s of Object.values(roles.sistemas)) for (const r of Object.values(s.patrones)) nombresRol.add(r);
for (const [de, aLista] of Object.entries(roles["puede-servir-a"])) {
  if (de.startsWith("_")) continue;
  nombresRol.add(de);
  for (const a of aLista as string[]) {
    nombresRol.add(a);
    aristas.push({
      tipo: "PUEDE_SERVIR_A",
      de: ["Rol", de],
      a: ["Rol", a],
      fuente: "roles.json",
      ancla: `roles.json: puede-servir-a › ${de}`,
    });
  }
}

const grafo = {
  generado: new Date().toISOString(),
  head: (await correr("git", ["rev-parse", "HEAD"])).trim(),
  avisos: { ghFallo, sinResolver },
  nodos: {
    Sistema: [{ nombre: "SDK" }, { nombre: "Explorador" }],
    Folder: [...carpetas].sort().map((r) => ({ ruta: r })),
    Archivo: nodosArchivo,
    Rol: [...nombresRol].sort().map((nombre) => ({ nombre })),
    PR: [...prs.values()].sort((a, b) => a.numero - b.numero),
    Alias: [...aliases.keys()].map((nombre) => ({ nombre })),
  },
  aristas,
};
Deno.mkdirSync(new URL("generado/", AQUI), { recursive: true });
Deno.writeTextFileSync(SALIDA, JSON.stringify(grafo, null, 1));

// ---------- estado visible ----------
console.log(`extraer: ${ruta(SALIDA).slice(RAIZ.length)} (HEAD ${grafo.head.slice(0, 7)})`);
for (const [label, lista] of Object.entries(grafo.nodos)) console.log(`  nodo ${label.padEnd(8)} ${lista.length}`);
const porTipo = Object.groupBy(aristas, (a) => a.tipo);
for (const [tipo, lista] of Object.entries(porTipo)) console.log(`  arista ${tipo.padEnd(15)} ${lista!.length}`);
const sinRol = aristas.filter((a) => a.tipo === "TIENE_ROL" && a.a[1] === "Sin rol").length;
console.log(`  archivos "Sin rol": ${sinRol}`);
if (ghFallo) console.log(`  AVISO gh falló, títulos = nombre de rama: ${ghFallo}`);
if (sinResolver.length) console.log(`  imports relativos sin resolver: ${sinResolver.join(", ")}`);
const rolDeArchivo = new Map(aristas.filter((a) => a.tipo === "TIENE_ROL").map((a) => [a.de[1], a.a[1] as string]));
const permitido = new Set(aristas.filter((a) => a.tipo === "PUEDE_SERVIR_A").map((a) => `${a.de[1]}>${a.a[1]}`));
const rompen = aristas.filter((a) => {
  if (a.tipo !== "SIRVE_A") return false;
  const [de, para] = [rolDeArchivo.get(a.de[1] as string), rolDeArchivo.get(a.a[1] as string)];
  return de !== "Sin rol" && para !== "Sin rol" && !permitido.has(`${de}>${para}`);
});
console.log(`  SIRVE_A que rompen puede-servir-a: ${rompen.length}`);
for (const a of rompen) {
  console.log(
    `    ${a.de[1]} (${rolDeArchivo.get(a.de[1] as string)}) → ${a.a[1]} (${
      rolDeArchivo.get(a.a[1] as string)
    }) @ ${a.ancla}`,
  );
}
