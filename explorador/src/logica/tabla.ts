// Cuándo una respuesta se muestra como tabla y qué va en cada celda. Una lista de objetos (los JobPost, la demanda
// por tecnología, las dependencias) es una tabla; cualquier otra cosa, solo JSON.

export type Fila = Record<string, unknown>;

/** Una celda ya decidida: la Tabla solo elige el elemento. */
export type Celda =
  | { tipo: "vacia" }
  | { tipo: "texto"; texto: string }
  | { tipo: "numero"; texto: string }
  | { tipo: "link"; href: string; texto: string }
  | { tipo: "etiquetas"; etiquetas: string[] };

const esObjeto = (v: unknown): v is Fila => typeof v === "object" && v !== null && !Array.isArray(v);

export function esListaDeObjetos(datos: unknown): datos is Fila[] {
  return Array.isArray(datos) && datos.length > 0 && datos.every(esObjeto);
}

/** Las claves de las filas en el orden en que aparecen. Mira las primeras `muestra`: alcanza y no recorre 10 000. */
export function columnas(filas: Fila[], muestra = 50): string[] {
  const vistas = new Set<string>();
  for (const fila of filas.slice(0, muestra)) for (const clave of Object.keys(fila)) vistas.add(clave);
  return [...vistas];
}

// Lo que se lee de un objeto anidado: un Technology es su `nombre`.
const nombreDe = (v: unknown) =>
  esObjeto(v) ? String(v.nombre ?? v.name ?? v.titulo ?? JSON.stringify(v)) : String(v);

/** https://news.ycombinator.com/item?id=1 → news.ycombinator.com/item?id=1, cortado a `largo`. */
export function linkCorto(href: string, largo = 48): string {
  const sinEsquema = href.replace(/^https?:\/\/(www\.)?/, "");
  return sinEsquema.length > largo ? `${sinEsquema.slice(0, largo - 1)}…` : sinEsquema;
}

export function celda(valor: unknown): Celda {
  if (valor === undefined || valor === null || valor === "") return { tipo: "vacia" };
  if (typeof valor === "number") return { tipo: "numero", texto: valor.toLocaleString("es") };
  if (typeof valor === "boolean") return { tipo: "texto", texto: valor ? "sí" : "no" };
  if (typeof valor === "string") {
    return /^https?:\/\/\S+$/.test(valor) ? { tipo: "link", href: valor, texto: linkCorto(valor) } : {
      tipo: "texto",
      texto: valor,
    };
  }
  if (Array.isArray(valor)) {
    return valor.length ? { tipo: "etiquetas", etiquetas: valor.map(nombreDe) } : { tipo: "vacia" };
  }
  return { tipo: "texto", texto: nombreDe(valor) };
}
