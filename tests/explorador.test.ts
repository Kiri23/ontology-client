// El explorador (explorador/) tiene una historia por cada función que exporta mod.ts. La regla vive acá y no en la
// prosa: si el SDK gana una función y nadie le hace su historia, este test falla en CI (ci.yml corre deno task test).
// Las funciones salen del módulo en runtime, no de una lista: `export * as jobs` aporta jobs.get, jobs.descartar…
// Las clases (ErrorServidor) y las constantes no son historias.

import { assert, assertEquals } from "@std/assert";
import * as sdk from "../mod.ts";
import { HISTORIAS } from "../explorador/src/historias/index.ts";
import contrato from "../contrato/openapi.json" with { type: "json" };

const esClase = (f: unknown) => typeof f === "function" && /^class[\s{]/.test(Function.prototype.toString.call(f));
const esFuncion = (f: unknown) => typeof f === "function" && !esClase(f);

/** Las funciones de mod.ts por su nombre de acceso: "validarProyecto", "jobs.get". */
function funcionesDelSdk(): string[] {
  const nombres: string[] = [];
  for (const [nombre, valor] of Object.entries(sdk)) {
    if (esFuncion(valor)) nombres.push(nombre);
    else if (typeof valor === "object" && valor !== null) {
      for (const [miembro, v] of Object.entries(valor)) if (esFuncion(v)) nombres.push(`${nombre}.${miembro}`);
    }
  }
  return nombres.sort();
}

Deno.test("explorador: cada función de mod.ts tiene su historia", () => {
  const conHistoria = new Set(HISTORIAS.map((h) => h.funcion));
  const faltan = funcionesDelSdk().filter((f) => !conHistoria.has(f));
  assertEquals(
    faltan,
    [],
    `sin historia en el explorador: ${faltan.join(", ")}. Agregala en explorador/src/historias/ ` +
      '(ver explorador/README.md, "Agregar una historia").',
  );
});

Deno.test("explorador: cada historia corre una función que mod.ts exporta", () => {
  const exportadas = new Set(funcionesDelSdk());
  const huerfanas = HISTORIAS.filter((h) => !exportadas.has(h.funcion)).map((h) => `${h.id} → ${h.funcion}`);
  assertEquals(huerfanas, [], "historias de funciones que mod.ts ya no exporta");
});

Deno.test("explorador: los ids de las historias no se repiten (van en la URL)", () => {
  const ids = HISTORIAS.map((h) => h.id);
  assertEquals(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

Deno.test("explorador: una historia que escribe pide token", () => {
  const sinToken = HISTORIAS.filter((h) => h.escribe && !h.token).map((h) => h.id);
  assertEquals(sinToken, [], "una historia con escribe: true necesita token: la página no la deja correr sin él");
});

Deno.test("explorador: cada GET del contrato es una historia de crearCliente, y ningún POST lo es", () => {
  const paths = contrato.paths as Record<string, Record<string, unknown>>;
  const gets = Object.keys(paths).filter((p) => "get" in paths[p]).map((p) => `cliente.GET${p}`).sort();
  const deCliente = HISTORIAS.filter((h) => h.funcion === "crearCliente").map((h) => h.id).sort();
  assertEquals(deCliente, gets);
  assert(gets.length > 0, "el contrato no trae ningún GET: ¿cambió su forma?");
});
