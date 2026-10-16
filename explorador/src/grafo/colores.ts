// Los colores del lienzo salen de las variables de estilos/grafo.css (una sola fuente, con su modo oscuro). Cytoscape
// pinta en un canvas y no entiende var() ni oklch(): se resuelve cada variable a rgb pintándola en un canvas de 1×1.

export function resolverColor(variable: string, dentro: HTMLElement): string {
  const muestra = document.createElement("span");
  muestra.style.color = `var(${variable})`;
  dentro.append(muestra);
  const color = getComputedStyle(muestra).color;
  muestra.remove();
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
