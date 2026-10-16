// Capturas del explorador para un PR, con chromium-box (browserless, endpoint /function con Puppeteer).
//
//   npm run build && node scripts/capturas.mjs <carpeta-de-salida>
//
// kiri-pr-shots y chromium-shot.py le mandan al Chrome remoto un HTML con todo adentro; una SPA no les sirve (uno no
// ejecuta módulos con imports, el otro quita los <script>). Acá el Chrome remoto navega a la URL de producción,
// https://ontology.kiri231.com/explorador/, y cada pedido a /explorador/* se contesta con el dist/ local: la página
// queda en su origen real y el SDK le pide los datos a la API de verdad. Solo GET: un pedido de otro método a la API
// se aborta antes de salir, así una captura nunca escribe en producción. El token de browserless no sale de la VM.
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const DIST = new URL("../dist/", import.meta.url);
const ORIGEN = "https://ontology.kiri231.com";
const HOST = process.env.CHROMIUM_BOX_HOST ?? "chromium-box.exe.xyz";
const LINK = "https://news.ycombinator.com/item?id=50063001";
const CHECKOUT = "https://github.com/actions/checkout#.";
// Una consulta con una clase que no existe (k:Accion): el validador la rechaza y propone k:Action.
const CON_ERROR = `PREFIX k: <https://kiri23.dev/catalogo#>
SELECT ?accion WHERE { ?accion a k:Accion }`;
// El lienzo terminó su layout (Lienzo.tsx pone data-listo) y Cytoscape ya dibujó su canvas.
const LIENZO = '.lienzo[data-listo="true"] canvas';

const CAPTURAS = [
  {
    nombre: "jobs-get",
    hash: "#/jobs.get?tecnologia=python",
    correr: true,
    esperar: "table",
  },
  {
    // Con un token de mentira en sessionStorage, para ver la confirmación. Nunca se aprieta "Sí, escribir", y el POST
    // se abortaría igual: la interceptación de abajo no deja salir nada que no sea GET.
    nombre: "confirmacion",
    hash: `#/jobs.descartar?link=${encodeURIComponent(LINK)}&porque=pide+5+a%C3%B1os+de+Java`,
    token: "no-es-un-token",
    correr: true,
    esperar: ".confirmar",
  },
  {
    nombre: "accion-sin-token",
    hash: `#/jobs.descartar?link=${encodeURIComponent(LINK)}&porque=pide+5+a%C3%B1os+de+Java`,
    correr: false,
    esperar: ".motivo",
  },
  {
    nombre: "error",
    hash: "#/cliente.GET/preguntar?consulta=nada",
    correr: true,
    esperar: ".recibo-error",
  },
  { nombre: "grafo-mapa", hash: "#/grafo/mapa", esperar: LIENZO },
  {
    nombre: "grafo-nodo",
    hash: `#/grafo/nodo?${new URLSearchParams({
      iri: CHECKOUT,
      saltos: `${CHECKOUT} < https://kiri23.dev/catalogo#ejecutaEnCI`,
    })}`,
    esperar: LIENZO,
  },
  { nombre: "grafo-acciones-mas-usadas", hash: "#/grafo/acciones-mas-usadas", esperar: LIENZO },
  { nombre: "grafo-huecos", hash: "#/grafo/huecos", esperar: LIENZO },
  {
    nombre: "grafo-consulta-rechazo",
    hash: `#/grafo/consulta?${new URLSearchParams({ sparql: CON_ERROR })}`,
    esperar: ".rechazo",
  },
];
// La misma CSP que pone el Caddyfile, así la captura también prueba que la página anda con ella.
const CSP =
  readFileSync(new URL("../Caddyfile", import.meta.url), "utf8").match(/Content-Security-Policy "([^"]+)"/)[1];

const ANCHOS = [
  { ancho: 390, alto: 844, escala: 2 },
  { ancho: 1280, alto: 900, escala: 1 },
];

const salida = process.argv[2];
if (!salida) {
  console.error("uso: node scripts/capturas.mjs <carpeta-de-salida>");
  process.exit(2);
}

// dist/ entero, por la ruta en que lo pide el navegador: /explorador/, /explorador/assets/…
const archivos = {
  "/explorador/": readFileSync(new URL("index.html", DIST)).toString("base64"),
};
for (const nombre of readdirSync(new URL("assets/", DIST))) {
  archivos[`/explorador/assets/${nombre}`] = readFileSync(
    new URL(`assets/${nombre}`, DIST),
  ).toString("base64");
}

// Corre en chromium-box. `context` llega como JSON.
const codigo = `export default async function ({ page, context }) {
  const { archivos, origen, capturas, anchos, csp } = context;
  const tipos = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".html": "text/html",
    ".wasm": "application/wasm",
  };
  const tipo = (ruta) => tipos[ruta.slice(ruta.lastIndexOf("."))] ?? "text/html";
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.origin !== origen) return r.continue();
    if (url.pathname.startsWith("/explorador/")) {
      const b64 = archivos[url.pathname];
      const headers = { "Content-Security-Policy": csp };
      return b64 ? r.respond({ status: 200, contentType: tipo(url.pathname), headers, body: bytes(b64) })
        : r.respond({ status: 404, contentType: "text/plain", body: "no" });
    }
    if (r.method() !== "GET") return r.abort();
    return r.continue();
  });
  // Cada violación de la CSP que vea la página queda anotada y vuelve con la captura.
  await page.evaluateOnNewDocument(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window.__csp ??= []).push(e.violatedDirective + " " + e.blockedURI);
    });
  });
  const salida = [];
  for (const a of anchos) {
    await page.setViewport({ width: a.ancho, height: a.alto, deviceScaleFactor: a.escala });
    for (const c of capturas) {
      await page.goto("about:blank");
      await page.goto(origen + "/explorador/" + c.hash, { waitUntil: "networkidle0" });
      // El token de una captura no pasa a la siguiente: mismo origen, misma pestaña.
      await page.evaluate((t) => {
        sessionStorage.clear();
        if (t) sessionStorage.setItem("ontology-explorador.token.acciones", t);
      }, c.token ?? "");
      await page.reload({ waitUntil: "networkidle0" });
      if (c.correr) {
        await page.waitForSelector(".boton-correr");
        await page.click(".boton-correr");
      }
      await page.waitForSelector(c.esperar, { timeout: 20000 });
      // Correr enfoca el botón y scrollea: arriba de todo, así la barra sticky del teléfono queda en su lugar.
      await page.evaluate(() => (document.activeElement?.blur(), window.scrollTo(0, 0), document.fonts.ready));
      await new Promise((listo) => setTimeout(listo, 700));
      const png = await page.screenshot({ fullPage: true, encoding: "base64" });
      const csp = await page.evaluate(() => window.__csp ?? []);
      salida.push({ nombre: c.nombre + "-" + a.ancho, png, csp });
    }
  }
  return { data: salida, type: "application/json" };
}`;

const cuerpo = JSON.stringify({
  code: codigo,
  context: { archivos, origen: ORIGEN, capturas: CAPTURAS, anchos: ANCHOS, csp: CSP },
});
const remoto = 'T=$(cat ~/browserless.token); curl -s -X POST -H "Content-Type: application/json" ' +
  '--data-binary @- "http://127.0.0.1:8000/function?token=$T"';
const r = spawnSync("ssh", [HOST, remoto], {
  input: cuerpo,
  maxBuffer: 64 * 1024 * 1024,
});
let respuesta;
try {
  respuesta = JSON.parse(r.stdout.toString());
} catch {
  console.error(
    `chromium-box no devolvió JSON (ssh exit ${r.status}):\n${r.stdout.toString().slice(0, 600)}`,
  );
  console.error(r.stderr.toString().slice(0, 600));
  process.exit(1);
}
mkdirSync(salida, { recursive: true });
const capturas = respuesta.data ?? respuesta;
if (!Array.isArray(capturas)) {
  console.error(`chromium-box no devolvió capturas:\n${JSON.stringify(respuesta).slice(0, 800)}`);
  process.exit(1);
}
let violaciones = 0;
for (const { nombre, png, csp } of capturas) {
  const ruta = `${salida}/${nombre}.png`;
  writeFileSync(ruta, Buffer.from(png, "base64"));
  console.log(`${ruta}  CSP: ${csp.length ? csp.join("; ") : "sin violaciones"}`);
  violaciones += csp.length;
}
process.exit(violaciones ? 1 : 0);
