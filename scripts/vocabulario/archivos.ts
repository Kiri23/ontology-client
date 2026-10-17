// archivos.ts — docs/vocabulary/ en disco: leerlo, compararlo con lo que sale del TTL y escribirlo.
//
// `comparar` no toca el disco: recibe los dos mapas (nombre → contenido) para que los tests no necesiten
// --allow-write. Cualquier archivo del directorio que el TTL no genera cuenta como sobrante.

// Cada archivo de `dir` (sin subdirectorios) → su contenido. Vacío si el directorio no existe.
export async function leerDirectorio(dir: URL): Promise<Map<string, string>> {
  const archivos = new Map<string, string>();
  try {
    for await (const e of Deno.readDir(dir)) {
      if (e.isFile) archivos.set(e.name, await Deno.readTextFile(new URL(e.name, dir)));
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return archivos;
}

// Lo que separa `actual` de `esperado`, un renglón por archivo, en orden; vacío si son iguales.
export function comparar(actual: Map<string, string>, esperado: Map<string, string>): string[] {
  const nombres = [...new Set([...actual.keys(), ...esperado.keys()])].sort();
  return nombres.flatMap((n) => {
    if (!esperado.has(n)) return [`${n}: sobra (no sale de docs/vocabulary.ttl)`];
    if (!actual.has(n)) return [`${n}: falta`];
    if (actual.get(n) !== esperado.get(n)) return [`${n}: no coincide con lo que sale de docs/vocabulary.ttl`];
    return [];
  });
}

// Deja `dir` igual a `esperado`: escribe lo que cambió y borra lo que sobra.
export async function escribir(dir: URL, actual: Map<string, string>, esperado: Map<string, string>): Promise<void> {
  await Deno.mkdir(dir, { recursive: true });
  for (const [nombre, contenido] of esperado) {
    if (actual.get(nombre) !== contenido) await Deno.writeTextFile(new URL(nombre, dir), contenido);
  }
  for (const nombre of actual.keys()) {
    if (!esperado.has(nombre)) await Deno.remove(new URL(nombre, dir));
  }
}
