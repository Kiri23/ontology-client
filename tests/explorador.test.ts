// El explorador (explorador/) tiene una historia por cada función que exporta mod.ts, y una historia que escribe en el
// servidor lo declara. Las reglas viven acá y no en la prosa: ci.yml corre deno task test.
//
// - Cobertura por identidad: las funciones salen del módulo en runtime, recorriendo los namespaces (`export * as jobs`
//   aporta jobs.get…, y uno anidado también se recorre), y se comparan con la `fn` de cada historia, que es la misma
//   referencia que su `correr` llama (explorador/src/historias/tipos.ts, historia()). Las clases (ErrorServidor) y las
//   constantes no son historias.
// - Escritura por comportamiento: cada historia se corre con un fetch falso, y la que hace un pedido que no es GET
//   tiene que tener `escribe: true` (y al revés). Sin el flag, la página la correría con un clic, sin confirmación.

import { assert, assertEquals } from "@std/assert";
import * as sdk from "../mod.ts";
import { HISTORIAS } from "../explorador/src/historias/index.ts";
import contrato from "../contrato/openapi.json" with { type: "json" };

const esClase = (f: unknown) => typeof f === "function" && /^class[\s{]/.test(Function.prototype.toString.call(f));
const esFuncion = (f: unknown) => typeof f === "function" && !esClase(f);

/** Cada función de mod.ts → su nombre de acceso ("validarProyecto", "jobs.get", "a.b.c" si hay namespaces anidados). */
function funcionesDelSdk(): Map<unknown, string> {
  const nombres = new Map<unknown, string>();
  const vistos = new Set<unknown>();
  const recorrer = (objeto: object, prefijo: string) => {
    if (vistos.has(objeto)) return;
    vistos.add(objeto);
    for (const [nombre, valor] of Object.entries(objeto)) {
      if (esFuncion(valor)) nombres.set(valor, prefijo + nombre);
      else if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
        recorrer(valor, `${prefijo}${nombre}.`);
      }
    }
  };
  recorrer(sdk, "");
  return nombres;
}

Deno.test("explorador: cada función de mod.ts tiene su historia (por identidad)", () => {
  const conHistoria = new Set<unknown>(HISTORIAS.map((h) => h.fn));
  const faltan = [...funcionesDelSdk()].filter(([fn]) => !conHistoria.has(fn)).map(([, nombre]) => nombre);
  assertEquals(
    faltan,
    [],
    `sin historia en el explorador: ${faltan.join(", ")}. Agregala en explorador/src/historias/ ` +
      '(ver explorador/README.md, "Agregar una historia").',
  );
});

Deno.test("explorador: la fn de cada historia es una función de mod.ts y su nombre es el de esa función", () => {
  const exportadas = funcionesDelSdk();
  const mal = HISTORIAS
    .filter((h) => exportadas.get(h.fn) !== h.funcion)
    .map((h) => `${h.id}: funcion "${h.funcion}", fn es ${exportadas.get(h.fn) ?? "algo que mod.ts no exporta"}`);
  assertEquals(mal, []);
});

Deno.test("explorador: los ids de las historias no se repiten (van en la URL)", () => {
  const ids = HISTORIAS.map((h) => h.id);
  assertEquals(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

Deno.test("explorador: una historia que escribe pide token", () => {
  const sinToken = HISTORIAS.filter((h) => h.escribe && !h.token).map((h) => h.id);
  assertEquals(sinToken, [], "una historia con escribe: true necesita token: la página no la deja correr sin él");
});

// validarProyecto manda la ficha por POST /proyectos, pero el servidor solo la valida contra las reglas y responde el
// reporte: no guarda nada (es POST porque la ficha va en el body). Es la única historia que hace un pedido que no es
// GET sin escribir. Cualquier otra que no haga GET escribe, y tiene que decirlo.
const NO_GET_QUE_NO_ESCRIBE = new Set(["validarProyecto"]);

// Lo mínimo que cada endpoint devuelve para que el SDK no tire antes de tiempo.
function responder(pedido: Request): Response {
  const ruta = new URL(pedido.url).pathname;
  if (ruta === "/proyectos") return Response.json({ conforma: true, reporte: "Conforms: True" });
  if (pedido.method !== "GET") return Response.json({ link: "https://example.com/puesto" });
  return Response.json([]);
}

Deno.test("explorador: una historia hace un pedido que no es GET si y solo si tiene escribe: true", async () => {
  const mal: string[] = [];
  for (const h of HISTORIAS) {
    const metodos: string[] = [];
    const fetch = (pedido: Request) => {
      metodos.push(pedido.method);
      return Promise.resolve(responder(pedido));
    };
    // Cada control con un valor que el SDK acepta: un link sirve de link, de consulta y de filtro.
    const valores = Object.fromEntries(
      h.controles.map((c) => [c.nombre, c.inicial ?? (c.tipo === "pares" ? "" : "https://example.com/puesto")]),
    );
    // Un servidor local que no existe y un token explícito: si el fetch falso fallara, nada sale a producción.
    await h.correr(valores, { url: "http://127.0.0.1:9", fetch, token: "prueba" });
    if (!metodos.length) {
      mal.push(`${h.id}: no hizo ningún pedido`);
      continue;
    }
    const noGet = metodos.some((m) => m !== "GET");
    const excepcion = NO_GET_QUE_NO_ESCRIBE.has(h.funcion);
    if (excepcion && !noGet) mal.push(`${h.id}: está en NO_GET_QUE_NO_ESCRIBE pero hizo ${metodos.join(", ")}`);
    if (!excepcion && noGet !== !!h.escribe) {
      mal.push(`${h.id}: hizo ${metodos.join(", ")} y tiene escribe: ${!!h.escribe}`);
    }
  }
  assertEquals(mal, []);
});

Deno.test("explorador: cada GET del contrato es una historia de crearCliente, y ningún POST lo es", () => {
  const paths = contrato.paths as Record<string, Record<string, unknown>>;
  const gets = Object.keys(paths).filter((p) => "get" in paths[p]).map((p) => `cliente.GET${p}`).sort();
  const deCliente = HISTORIAS.filter((h) => h.funcion === "crearCliente").map((h) => h.id).sort();
  assertEquals(deCliente, gets);
  assert(gets.length > 0, "el contrato no trae ningún GET: ¿cambió su forma?");
});
