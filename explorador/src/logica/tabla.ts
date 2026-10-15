// Cuándo una respuesta se muestra como tabla y qué va en cada celda. Una lista de objetos (los JobPost, la demanda
// por tecnología, las dependencias) es una tabla; cualquier otra cosa, solo JSON.

export type Fila = Record<string, unknown>;

/** Una celda ya decidida: la Tabla solo elige el elemento. */
export type Celda =
  | { tipo: "vacia" }
  | { tipo: "texto"; texto: string }
  | { tipo: "numero"; texto: string }
  | { tipo: "link"; href: string; texto: string }
  | { tipo: "fecha"; iso: string; texto: string }
  | { tipo: "etiquetas"; etiquetas: string[] };

const esObjeto = (v: unknown): v is Fila => typeof v === "object" && v !== null && !Array.isArray(v);

export function esListaDeObjetos(datos: unknown): datos is Fila[] {
  return Array.isArray(datos) && datos.length > 0 && datos.every(esObjeto);
}

const TITULOS = new Set(["titulo", "nombre", "puesto", "title", "name"]);
const esUrl = (v: unknown) => typeof v === "string" && /^https?:\/\/\S+$/.test(v);

/**
 * Las claves de las filas, en el orden en que se leen: primero lo que nombra la fila (titulo, nombre), después el resto
 * como aparece, y al final las que son links (largas y poco legibles). Mira las primeras `muestra` filas.
 */
export function columnas(filas: Fila[], muestra = 50): string[] {
  const vistas = new Set<string>();
  for (const fila of filas.slice(0, muestra)) for (const clave of Object.keys(fila)) vistas.add(clave);
  const peso = (clave: string) => {
    if (TITULOS.has(clave)) return 0;
    const ejemplo = filas.slice(0, muestra).find((f) => f[clave] !== undefined && f[clave] !== "")?.[clave];
    return esUrl(ejemplo) ? 2 : 1;
  };
  return [...vistas].sort((a, b) => peso(a) - peso(b)); // sort es estable: dentro de cada peso, el orden de aparición
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Lo que se lee de un objeto anidado: un Technology es su `nombre`.
const nombreDe = (v: unknown) => esObjeto(v) ? String(v.nombre ?? v.name ?? v.titulo ?? JSON.stringify(v)) : String(v);

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
    if (esUrl(valor)) return { tipo: "link", href: valor, texto: linkCorto(valor) };
    const fecha = ISO.test(valor) ? new Date(valor) : undefined;
    if (fecha && !Number.isNaN(fecha.getTime())) {
      return {
        tipo: "fecha",
        iso: valor,
        texto: fecha.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }),
      };
    }
    return { tipo: "texto", texto: valor };
  }
  if (Array.isArray(valor)) {
    return valor.length ? { tipo: "etiquetas", etiquetas: valor.map(nombreDe) } : { tipo: "vacia" };
  }
  return { tipo: "texto", texto: nombreDe(valor) };
}
