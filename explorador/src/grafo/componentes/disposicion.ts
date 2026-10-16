// Dónde va cada nodo y cuánto lienzo hace falta. Sin React; lo usa Lienzo.tsx.
// - El grafo entero se dispone una vez por Modelo y se reusa (Mapa, prearmadas, consulta libre): las islas no cambian
//   de lugar entre vistas. Y el sorteo de fcose va con semilla fija: al recargar, la misma forma.
// - En el teléfono el lienzo toma el alto que pide el dibujo (el grafo es más ancho que alto): sin franjas vacías.
import type { CollectionArgument, Core, Position } from "cytoscape";
import type { Modelo } from "../logica/modelo.ts";

const POSICIONES = new WeakMap<Modelo, Map<string, Position>>();

export const posicionesGuardadas = (m: Modelo) => POSICIONES.get(m);

export function guardarPosiciones(m: Modelo, cy: Core) {
  POSICIONES.set(m, new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }])));
}

// mulberry32: un generador chico con semilla, el mismo cada vez.
function generador(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Corre `disponer` con Math.random sembrado. fcose sortea con Math.random y no acepta semilla; sin animación corre
 * sincrónico, así que el reemplazo dura lo que dura el layout y se devuelve en el finally.
 */
export function conSemilla(disponer: () => void, semilla = 23) {
  const azar = Math.random;
  Math.random = generador(semilla);
  try {
    disponer();
  } finally {
    Math.random = azar;
  }
}

const ZOOM_ENCUADRE = 1.6;

/** Encuadra unos elementos sin acercarse de más: con tres nodos, un fit llega al zoom máximo y todo se ve enorme. */
export function encuadrar(cy: Core, elementos?: CollectionArgument) {
  cy.fit(elementos, 28);
  if (cy.zoom() > ZOOM_ENCUADRE) {
    cy.zoom(ZOOM_ENCUADRE);
    cy.center(elementos);
  }
}

const angosto = () => globalThis.matchMedia?.("(max-width: 71.99rem)").matches ?? false;

/** En el teléfono, el alto del lienzo sigue la forma del dibujo, entre 16rem y el 70 % de la pantalla. */
export function ajustarAlto(cy: Core, contenedor: HTMLElement) {
  if (!angosto()) return contenedor.style.removeProperty("height");
  const caja = cy.elements().boundingBox();
  if (!caja.w || !caja.h) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const alto = contenedor.clientWidth * caja.h / caja.w + 56;
  contenedor.style.height = `${Math.round(Math.min(Math.max(alto, 16 * rem), globalThis.innerHeight * 0.7))}px`;
  cy.resize();
}
