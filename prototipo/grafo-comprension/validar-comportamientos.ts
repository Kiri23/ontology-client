// validar-comportamientos.ts — PROTOTIPO: el validador del juicio del agente sobre comportamientos.json. Por cada
// ancla: el archivo existe, el rango de líneas cabe en el archivo y el `simbolo` aparece literal en esas líneas.
//
//   env -u LD_PRELOAD deno run --config deno.json --allow-read prototipo/grafo-comprension/validar-comportamientos.ts
//
// Exit 1 con la lista de fallos. cargar.ts lo importa y no carga si falla.

const RAIZ = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const TIPOS = ["dato", "estilo", "lógica", "estructura"];

export interface Ancla {
  archivo: string;
  lineas: [number, number];
  simbolo: string;
}
export interface Comportamiento {
  nombre: string;
  descripcion: string;
  tipo: string;
  existe?: boolean;
  nota?: string;
  "lo-decide": Ancla[];
}

export function leerComportamientos(): Comportamiento[] {
  return JSON.parse(Deno.readTextFileSync(new URL("comportamientos.json", import.meta.url))).comportamientos;
}

export function validar(comportamientos: Comportamiento[]): { fallos: string[]; anclas: number } {
  const fallos: string[] = [];
  let anclas = 0;
  for (const c of comportamientos) {
    if (!TIPOS.includes(c.tipo)) fallos.push(`${c.nombre}: tipo "${c.tipo}" no es ${TIPOS.join(" | ")}`);
    for (const { archivo, lineas: [desde, hasta], simbolo } of c["lo-decide"]) {
      anclas++;
      const donde = `${c.nombre} → ${archivo}:L${desde}-L${hasta}`;
      let texto: string;
      try {
        texto = Deno.readTextFileSync(RAIZ + archivo);
      } catch {
        fallos.push(`${donde}: el archivo no existe`);
        continue;
      }
      const lineas = texto.split("\n");
      const total = lineas.length - (texto.endsWith("\n") ? 1 : 0);
      if (!(desde >= 1 && desde <= hasta && hasta <= total)) {
        fallos.push(`${donde}: rango fuera del archivo (tiene ${total} líneas)`);
        continue;
      }
      if (!simbolo) {
        fallos.push(`${donde}: simbolo vacío`);
        continue;
      }
      if (!lineas.slice(desde - 1, hasta).join("\n").includes(simbolo)) {
        fallos.push(`${donde}: "${simbolo}" no aparece en esas líneas`);
      }
    }
  }
  return { fallos, anclas };
}

if (import.meta.main) {
  const comportamientos = leerComportamientos();
  const { fallos, anclas } = validar(comportamientos);
  console.log(`validar: ${comportamientos.length} comportamientos, ${anclas} anclas, ${fallos.length} fallos`);
  for (const f of fallos) console.log(`  FALLA ${f}`);
  if (fallos.length) Deno.exit(1);
}
