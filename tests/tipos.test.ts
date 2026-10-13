// Test de tipos: lo que prueba se cumple al compilar, no al correr. Si JobPost (el del contrato, vía
// generado/api.ts) pierde un campo o le cambia el tipo, este archivo deja de compilar y fallan
// `deno task test` y el paso Tipos de CI (`deno check ... tests/*.ts`). El @ts-expect-error prueba lo
// contrario: si aparece un campo que no está en el contrato, el comentario sobra y también falla.

import { assertEquals } from "@std/assert";
import { type JobPost, jobs, type Technology } from "../mod.ts";

// true solo si A y B son exactamente el mismo tipo (string | undefined no es string).
type Igual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function mismoTipo<A, B>(_: Igual<A, B>): void {}

Deno.test("tipos: jobs.get() devuelve JobPost[] y el editor conoce sus campos", async () => {
  const puesto: JobPost = {
    link: "https://news.ycombinator.com/item?id=1",
    fecha: "2026-10-13T21:03:57+00:00",
    fuente: "hn",
    titulo: "Dev",
    pide: [{ link: "https://kiri23.dev/tech#Python", nombre: "Python", sinonimos: [] }],
  };
  const fetch = () => Promise.resolve(Response.json([puesto]));

  const lista: JobPost[] = await jobs.get({ tecnologia: "python" }, { url: "http://falso", fetch });

  mismoTipo<typeof lista[0]["empresa"], string | undefined>(true);
  mismoTipo<typeof lista[0]["link"], string>(true);
  mismoTipo<typeof lista[0]["fecha"], string>(true);
  mismoTipo<typeof lista[0]["fuente"], string>(true);
  mismoTipo<typeof lista[0]["titulo"], string>(true);
  mismoTipo<typeof lista[0]["pide"], Technology[]>(true);
  mismoTipo<typeof lista[0]["pide"][0]["nombre"], string>(true);
  mismoTipo<typeof lista[0]["pide"][0]["sinonimos"], string[]>(true);
  mismoTipo<Parameters<typeof jobs.get>[0], { tecnologia?: string; fuente?: string } | undefined>(true);

  // @ts-expect-error salario no está en el schema JobPost del contrato
  lista[0].salario;
  // @ts-expect-error los filtros son los del contrato: no hay empresa
  await jobs.get({ empresa: "x" }, { url: "http://falso", fetch });

  assertEquals(lista[0].pide[0].nombre, "Python");
  assertEquals(lista[0].empresa, undefined);
});
