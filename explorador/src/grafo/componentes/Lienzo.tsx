// El lienzo: Cytoscape desde React 19 con un ref y efectos, sin wrapper. Recibe qué nodos y aristas mostrar y qué
// resaltar; cuando cambian, agrega y saca elementos sobre la misma instancia. Con `incremental`, los nodos que ya
// estaban se quedan quietos y el layout solo acomoda los nuevos (el stepper).
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useRef } from "react";
import { estiloDe, ESTILOS_CLASE } from "../logica/clases.ts";
import type { Arista, Modelo } from "../logica/modelo.ts";
import { compacto } from "../logica/prefijos.ts";
import { resolverColor } from "../colores.ts";
import "../../estilos/grafo.css";

cytoscape.use(fcose);

// Cytoscape mete un <style id="__________cytoscape_stylesheet"> en el <head> salvo que ya haya un elemento con ese id;
// con style-src 'self' ese <style> es una violación de la CSP. Un <meta> con el id lo evita; la única regla que traía
// (position: relative del contenedor) está en grafo.css.
const ID_HOJA = "__________cytoscape_stylesheet";
function ocuparHojaDeCytoscape() {
  if (!document.getElementById(ID_HOJA)) {
    document.head.append(Object.assign(document.createElement("meta"), { id: ID_HOJA }));
  }
}

/** Encuadra unos elementos sin acercarse de más: con tres nodos, un fit llega al zoom máximo y todo se ve enorme. */
function encuadrar(cy: Core, elementos?: cytoscape.CollectionArgument) {
  cy.fit(elementos, 28);
  if (cy.zoom() > ZOOM_ENCUADRE) {
    cy.zoom(ZOOM_ENCUADRE);
    cy.center(elementos);
  }
}
const ZOOM_ENCUADRE = 1.6;

const sinMovimiento = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

interface Props {
  modelo: Modelo;
  nodos: string[];
  aristas: Arista[];
  /** Si no está vacío, estos nodos se resaltan y el resto se apaga. */
  resaltados?: Set<string>;
  /** El nodo de la ficha. */
  foco?: string;
  alTocar?: (iri: string) => void;
  /** Los nodos puestos no se mueven al agregar otros. */
  incremental?: boolean;
  /** Etiquetas en todos los nodos y en las aristas (pocos elementos) o solo en las clases que la llevan. */
  etiquetas?: "todas" | "clave";
  /** Para lectores de pantalla: qué muestra. */
  descripcion: string;
}

function hojaDeEstilo(contenedor: HTMLElement, etiquetas: "todas" | "clave"): StylesheetJson {
  const color = (v: string) => resolverColor(v, contenedor);
  const tinta = color("--tinta");
  const papel = color("--papel");
  return [
    {
      selector: "node",
      style: {
        width: "data(tamano)",
        height: "data(tamano)",
        shape: "data(forma)" as never,
        "background-color": "data(color)",
        "border-width": 1,
        "border-color": papel,
        label: etiquetas === "todas" ? "data(etiqueta)" : "",
        "font-family": "Schibsted Grotesk Variable, system-ui, sans-serif",
        "font-size": 10,
        color: tinta,
        "text-valign": "bottom",
        "text-margin-y": 3,
        "text-background-color": papel,
        "text-background-opacity": 0.75,
        "text-background-padding": "1px",
        "min-zoomed-font-size": 6,
        "text-max-width": "90px",
        "text-wrap": "ellipsis",
      },
    },
    { selector: "node[?conEtiqueta]", style: { label: "data(etiqueta)" } },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": color("--arista"),
        "curve-style": "straight",
        "target-arrow-shape": etiquetas === "todas" ? "triangle" : "none",
        "target-arrow-color": color("--arista"),
        "arrow-scale": 0.6,
        label: etiquetas === "todas" ? "data(etiqueta)" : "",
        "font-family": "Martian Mono Variable, ui-monospace, monospace",
        "font-size": 6,
        color: color("--tinta-suave"),
        "text-rotation": "autorotate",
        "text-background-color": papel,
        "text-background-opacity": 0.75,
        "min-zoomed-font-size": 7,
      },
    },
    { selector: ".tenue", style: { opacity: 0.14, label: "" } },
    { selector: "node.resaltado", style: { label: "data(etiqueta)", "border-width": 2, "border-color": tinta } },
    {
      selector: "node.foco",
      style: { label: "data(etiqueta)", "border-width": 3, "border-color": tinta, "font-weight": "bold", "z-index": 9 },
    },
  ];
}

function definiciones(
  modelo: Modelo,
  nodos: string[],
  aristas: Arista[],
  contenedor: HTMLElement,
): ElementDefinition[] {
  const colores = new Map(ESTILOS_CLASE.map((e) => [e.tono, resolverColor(`--clase-${e.tono}`, contenedor)]));
  const otro = resolverColor("--clase-otra", contenedor);
  return [
    ...nodos.map((iri) => {
      const n = modelo.nodos.get(iri);
      const e = estiloDe(n?.clase ?? "");
      return {
        group: "nodes" as const,
        data: {
          id: iri,
          etiqueta: n?.etiqueta ?? iri,
          forma: e.forma,
          tamano: e.tamano,
          color: colores.get(e.tono) ?? otro,
          conEtiqueta: e.etiqueta,
        },
      };
    }),
    ...aristas.map((a) => ({
      group: "edges" as const,
      data: { id: a.id, source: a.desde, target: a.hasta, etiqueta: compacto(a.predicado) },
    })),
  ];
}

export function Lienzo(
  { modelo, nodos, aristas, resaltados, foco, alTocar, incremental = false, etiquetas = "clave", descripcion }: Props,
) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core>(null);
  const alTocarRef = useRef(alTocar);
  // Lo resaltado, para que el layout encuadre ahí al terminar (una consulta muestra su resultado de cerca).
  const marcadosRef = useRef<cytoscape.NodeCollection>(null);
  alTocarRef.current = alTocar;

  useEffect(() => {
    ocuparHojaDeCytoscape();
    const cy = cytoscape({
      container: ref.current,
      style: hojaDeEstilo(ref.current!, etiquetas),
      minZoom: 0.15,
      maxZoom: 4,
    });
    cy.on("tap", "node", (e) => alTocarRef.current?.(e.target.id()));
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [etiquetas]);

  // Los elementos: se agregan los nuevos y se sacan los que sobran; después, el layout.
  useEffect(() => {
    const cy = cyRef.current;
    const contenedor = ref.current;
    if (!cy || !contenedor) return;
    contenedor.dataset.listo = "false";
    const quiero = new Set([...nodos, ...aristas.map((a) => a.id)]);
    cy.elements().filter((el) => !quiero.has(el.id())).remove();
    const puestos = cy.nodes();
    const nuevas = definiciones(modelo, nodos, aristas, contenedor).filter((d) =>
      cy.getElementById(d.data.id!).empty()
    );
    const agregados = cy.add(nuevas);
    const soloAgregar = incremental && puestos.length > 0;
    if (soloAgregar && agregados.nodes().empty()) {
      contenedor.dataset.listo = "true";
      return;
    }
    if (soloAgregar) puestos.lock();
    const animar = soloAgregar && !sinMovimiento();
    const layout = cy.layout({
      name: "fcose",
      randomize: !soloAgregar,
      animate: animar,
      animationDuration: 320,
      fit: false,
      nodeDimensionsIncludeLabels: false,
      packComponents: true,
    } as cytoscape.LayoutOptions);
    layout.one("layoutstop", () => {
      puestos.unlock();
      encuadrar(cy, marcadosRef.current?.nonempty() ? marcadosRef.current : undefined);
      contenedor.dataset.listo = "true";
    });
    layout.run();
  }, [modelo, nodos, aristas, incremental, etiquetas]);

  // Resaltar: clases, y el encuadre va a lo resaltado (o al todo, si se soltó). Corre después del efecto de los
  // elementos: fcose sin animación ya dejó las posiciones.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || resaltados === undefined) return;
    const marcados = cy.nodes().filter((n) => resaltados.has(n.id()));
    marcadosRef.current = marcados;
    cy.batch(() => {
      cy.elements().removeClass("tenue resaltado");
      if (marcados.nonempty()) {
        cy.elements().difference(marcados.union(marcados.edgesWith(marcados))).addClass("tenue");
        marcados.addClass("resaltado");
      }
    });
    encuadrar(cy, marcados.nonempty() ? marcados : undefined);
  }, [resaltados, nodos, aristas]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes(".foco").removeClass("foco");
    if (foco) cy.getElementById(foco).addClass("foco");
  }, [foco, nodos, aristas]);

  return (
    <div className="lienzo-marco">
      <div ref={ref} className="lienzo" role="img" aria-label={descripcion} data-listo="false" />
      <button type="button" className="lienzo-encuadrar" onClick={() => cyRef.current && encuadrar(cyRef.current)}>
        Encuadrar
      </button>
    </div>
  );
}
