// @vitest-environment node
// La lógica de la vista Grafo contra el grafo real (pruebas/datos/grafo.ttl, el CONSTRUCT de producción del
// 2026-10-16) en el mismo motor que el navegador: oxigraph, con el WASM leído de node_modules. Sin red.
import { readFileSync } from "node:fs";
import init, { Store } from "oxigraph/web.js";
import { beforeAll, describe, expect, it } from "vitest";
import { escribirSaltos, leerSaltos, type Salto, sparqlDelCamino, subgrafo } from "../src/grafo/logica/camino.ts";
import { PREARMADAS } from "../src/grafo/logica/consultas.ts";
import { armarModelo, conteoPorClase, islas, type Modelo } from "../src/grafo/logica/modelo.ts";
import { conSemilla } from "../src/grafo/componentes/disposicion.ts";
import { compacto, nombreCorto, PREFIJOS } from "../src/grafo/logica/prefijos.ts";
import { relacionesDe } from "../src/grafo/logica/relaciones.ts";
import { filasDeTabla, leerResultado, nodosDelResultado, variablesDelSelect } from "../src/grafo/logica/resultados.ts";
import { leerVista } from "../src/grafo/logica/vistas.ts";
import { leerRuta } from "../src/logica/ruta.ts";
import { CONSULTA_CLASES, CONSULTA_PROPIEDADES, validar } from "../src/grafo/logica/validador.ts";

const K = PREFIJOS.ontologia;
const CHECKOUT = "https://github.com/actions/checkout#.";
const JOBSEARCH = "https://github.com/Kiri23/JobSearch";
let store: Store;
let modelo: Modelo;

beforeAll(async () => {
  await init({ module_or_path: readFileSync(new URL("../node_modules/oxigraph/web_bg.wasm", import.meta.url)) });
  store = new Store();
  store.load(readFileSync(new URL("./datos/grafo.ttl", import.meta.url), "utf8"), { format: "text/turtle" });
  modelo = armarModelo(store.match(null, null, null, null));
});

const conocidas = () => ({
  clases: new Set((store.query(CONSULTA_CLASES) as Map<string, { value: string }>[]).map((f) => f.get("c")!.value)),
  propiedades: new Set(
    (store.query(CONSULTA_PROPIEDADES) as Map<string, { value: string }>[]).map((f) => f.get("p")!.value),
  ),
});

describe("prefijos", () => {
  it("compacta con prefijo y deja entera la IRI que no tiene", () => {
    expect(compacto(K + "Action")).toBe("ontologia:Action");
    expect(compacto(CHECKOUT)).toBe(`<${CHECKOUT}>`);
  });
  it("un nombre corto que se lee", () => {
    expect(nombreCorto(CHECKOUT)).toBe("actions/checkout");
    expect(nombreCorto("https://github.com/Kiri23/TermuxConfig#.github/actions/pm-actividad")).toBe("pm-actividad");
    expect(nombreCorto("https://kiri231.com/repos/workflow/JobSearch.kiri-pm")).toBe("JobSearch.kiri-pm");
  });
});

describe("modelo", () => {
  it("235 nodos de instancias: sin el esquema, sin literales como nodos", () => {
    expect(store.size).toBe(1279);
    expect(modelo.nodos.size).toBe(235);
    expect(conteoPorClase(modelo).map(({ clase, n }) => `${compacto(clase)} ${n}`)).toEqual([
      "ontologia:JobPost 131",
      "ontologia:Uso 43",
      "ontologia:Workflow 21",
      "doap:Project 15",
      "ontologia:Technology 15",
      "ontologia:Action 10",
    ]);
    expect(modelo.aristas.some((a) => a.predicado.endsWith("#type"))).toBe(false);
  });
  it("las etiquetas salen de rdfs:label, skos:prefLabel o doap:name", () => {
    expect(modelo.nodos.get(JOBSEARCH)?.etiqueta).toBe("JobSearch");
    expect(modelo.nodos.get(CHECKOUT)?.etiqueta).toBe("actions/checkout");
    expect(modelo.nodos.get(JOBSEARCH)?.atributos).toContainEqual({ predicado: K + "esPublico", valor: "false" });
  });
  it("dos islas: los puestos con sus tecnologías, y los repos con su CI; lo demás, nodos sueltos", () => {
    const [repos, jobs, ...resto] = islas(modelo);
    expect([repos.length, jobs.length, resto.length]).toEqual([89, 74, 72]);
    const clases = (isla: string[]) => new Set(isla.map((i) => compacto(modelo.nodos.get(i)!.clase)));
    expect(resto.every((isla) => isla.length === 1)).toBe(true);
    expect(clases(jobs)).toEqual(new Set(["ontologia:JobPost", "ontologia:Technology"]));
    expect(clases(repos)).toEqual(new Set(["ontologia:Uso", "ontologia:Workflow", "doap:Project", "ontologia:Action"]));
  });
});

describe("stepper", () => {
  it("las relaciones de una acción, agrupadas y en las dos direcciones", () => {
    const r = relacionesDe(modelo, CHECKOUT).map((x) => `${x.direccion} ${compacto(x.predicado)} ${x.vecinos.length}`);
    expect(r).toEqual(["sale ontologia:alojadaEn 1", "entra ontologia:accion 14", "entra ontologia:ejecutaEnCI 6"]);
  });
  it("cada salto agrega sus vecinos, y los saltos van y vuelven por la URL", () => {
    const saltos: Salto[] = [{ desde: CHECKOUT, predicado: K + "ejecutaEnCI", direccion: "entra" }];
    const uno = subgrafo(modelo, CHECKOUT, saltos);
    expect([uno.nodos.length, uno.aristas.length]).toEqual([7, 6]);
    saltos.push({ desde: JOBSEARCH, predicado: K + "tieneWorkflow", direccion: "sale" });
    const dos = subgrafo(modelo, CHECKOUT, saltos);
    expect([dos.nodos.length, dos.aristas.length]).toEqual([9, 8]);
    expect(leerSaltos(escribirSaltos(saltos))).toEqual(saltos);
  });
  it("un salto desde un nodo que no está en el lienzo no agrega nada, ni al lienzo ni al SPARQL", () => {
    const fuera: Salto[] = [{ desde: JOBSEARCH, predicado: K + "tieneWorkflow", direccion: "sale" }];
    expect(subgrafo(modelo, CHECKOUT, fuera)).toEqual({ nodos: [CHECKOUT], aristas: [] });
    expect(sparqlDelCamino(modelo, CHECKOUT, fuera)).toBe(sparqlDelCamino(modelo, CHECKOUT, []));
  });
  it("lo que viene de la URL o de una etiqueta no escapa del comentario # del SPARQL del camino", () => {
    const hash = "#/grafo/nodo?iri=urn:x%0AINSERT%20DATA%20%7B%3Curn:a%3E%20%3Curn:b%3E%20%3Curn:c%3E%7D";
    const { iri } = leerVista(leerRuta(hash)) as { iri: string };
    expect(iri).toContain("\nINSERT DATA");
    expect(sparqlDelCamino(modelo, iri, [])).toBe("");
    const conSalto = armarModelo([
      {
        subject: { termType: "NamedNode", value: "urn:a" },
        predicate: { termType: "NamedNode", value: K + "accion" },
        object: { termType: "NamedNode", value: "urn:b" },
      },
      {
        subject: { termType: "NamedNode", value: "urn:a" },
        predicate: { termType: "NamedNode", value: PREFIJOS.rdfs + "label" },
        object: { termType: "Literal", value: "Título\nINSERT DATA { <urn:x> <urn:y> <urn:z> }\u2028DROP ALL" },
      },
    ]);
    const q = sparqlDelCamino(conSalto, "urn:a", [{ desde: "urn:a", predicado: K + "accion", direccion: "sale" }]);
    expect(q.split("\n").filter((l) => /INSERT|DROP/.test(l)).every((l) => l.trimStart().startsWith("#"))).toBe(true);
    expect(q).toContain("# Salto 1: lo que Título INSERT DATA { <urn:x> <urn:y> <urn:z> } DROP ALL tiene por");
  });
  it("el SPARQL del camino reproduce el lienzo y pasa el validador", () => {
    const saltos = [
      { desde: CHECKOUT, predicado: K + "ejecutaEnCI", direccion: "entra" as const },
      { desde: JOBSEARCH, predicado: K + "tieneWorkflow", direccion: "sale" as const },
    ];
    const q = sparqlDelCamino(modelo, CHECKOUT, saltos);
    expect(validar(q, conocidas())).toEqual({ ok: true, forma: "construct" });
    const r = leerResultado(store.query(q));
    expect(r.tipo === "triples" && r.triples.length).toBe(subgrafo(modelo, CHECKOUT, saltos).aristas.length);
    expect(validar(sparqlDelCamino(modelo, CHECKOUT, []), conocidas()).ok).toBe(true);
  });
});

describe("prearmadas", () => {
  it("cada una pasa el validador y da filas", () => {
    for (const p of PREARMADAS) {
      expect(validar(p.sparql, conocidas()), p.id).toEqual({ ok: true, forma: "select" });
      const r = leerResultado(store.query(p.sparql));
      expect(r.tipo === "filas" && r.filas.length, p.id).toBeGreaterThan(0);
    }
  });
  it("acciones más usadas: 10 filas, checkout primero con 14", () => {
    const r = leerResultado(store.query(PREARMADAS[0].sparql), ["accion", "usos"]);
    if (r.tipo !== "filas") throw new Error(r.tipo);
    expect(r.filas.length).toBe(10);
    expect(filasDeTabla(r, modelo)[0]).toEqual({ accion: "actions/checkout", usos: 14 });
    expect(nodosDelResultado(r, modelo).size).toBe(10);
  });
  it("huecos: 6 filas, ApiScripts no usa checkout", () => {
    const r = leerResultado(store.query(PREARMADAS[1].sparql), ["proyecto", "accion", "usan", "otros"]);
    if (r.tipo !== "filas") throw new Error(r.tipo);
    expect(r.filas.length).toBe(6);
    expect(filasDeTabla(r, modelo)[0]).toEqual({
      proyecto: "ApiScripts",
      accion: "actions/checkout",
      usan: 6,
      otros: 7,
    });
  });
});

describe("validador", () => {
  const rechazo = (q: string) => {
    const v = validar(q, conocidas());
    if (v.ok) throw new Error(`pasó: ${q}`);
    return v.motivos.join(" | ");
  };
  const K_ = `PREFIX ontologia: <${K}>\n`;
  it("rechaza lo que cambia datos, DESCRIBE, SERVICE y FROM, cada uno por su regla", () => {
    expect(rechazo("INSERT DATA { <urn:a> <urn:b> <urn:c> }")).toMatch(/cambia datos/);
    expect(rechazo("LOAD <http://x>")).toMatch(/cambia datos/);
    expect(rechazo("DESCRIBE <urn:x>")).toMatch(/^DESCRIBE no se corre/);
    expect(rechazo(`${K_}SELECT * WHERE { SERVICE <http://x> { ?s ontologia:accion ?o } }`)).toMatch(/^SERVICE/);
    expect(rechazo(`${K_}SELECT * FROM <urn:g> WHERE { ?s ontologia:accion ?o }`)).toMatch(/^FROM/);
  });
  it("una clase o una propiedad que no existen, con la parecida", () => {
    expect(rechazo(`${K_}SELECT ?a WHERE { ?a a ontologia:Accion }`)).toBe(
      "La clase ontologia:Accion no existe en el grafo; parecida: ontologia:Action.",
    );
    expect(rechazo(`PREFIX ontologia: <${PREFIJOS.ontologia}>\nSELECT ?s WHERE { ?s ontologia:salario ?x }`)).toMatch(
      /^La propiedad ontologia:salario no existe en el grafo/,
    );
    expect(rechazo(`${K_}SELECT ?s WHERE { ?s ontologia:tieneWorkflow/k:tieneUzo ?u }`)).toBe(
      "La propiedad ontologia:tieneUzo no existe en el grafo; parecida: ontologia:tieneUso.",
    );
  });
  it("lo que no parsea, y el prefijo sin declarar con la línea que falta", () => {
    expect(rechazo("SELEC nada")).toMatch(/^No se entiende la consulta/);
    expect(rechazo("SELECT ?a WHERE { ?a a ontologia:Action }")).toBe(
      `Falta declarar el prefijo ontologia:. Agregá arriba: PREFIX ontologia: <${K}>`,
    );
  });
  it("una propiedad inventada dentro de un path con |, ^, + o * también cae (los link del álgebra)", () => {
    for (
      const camino of [
        "(ontologia:accion|ontologia:inventada)",
        "^ontologia:inventada",
        "ontologia:inventada+",
        "ontologia:inventada*",
      ]
    ) {
      expect(rechazo(`${K_}SELECT * WHERE { ?s ${camino} ?o . ?s a ontologia:Uso }`), camino).toMatch(
        /^La propiedad ontologia:inventada no existe en el grafo/,
      );
    }
  });
  it("lo caro: un producto cartesiano (las dos consultas que congelaban la pestaña) y un ?s ?p ?o suelto", () => {
    expect(rechazo("SELECT (COUNT(*) AS ?n) WHERE { ?a ?b ?c . ?d ?e ?f . ?g ?h ?i }")).toBe(
      "Los patrones ?a ?b ?c y ?d ?e ?f y ?g ?h ?i no comparten ninguna variable: juntos son un producto cartesiano " +
        "(cada resultado de uno con cada resultado del otro) y congelan la pestaña. Unilos por una variable en común.",
    );
    expect(rechazo("SELECT * WHERE { ?a ?b ?c . ?d ?e ?f } LIMIT 1000000")).toMatch(/^Los patrones .* cartesiano/);
    expect(rechazo(`${K_}SELECT * WHERE { ?a a ontologia:Action . ?u a ontologia:Uso }`)).toMatch(/cartesiano/);
    expect(rechazo("SELECT ?p WHERE { ?s ?p ?o }")).toMatch(/^\?s \?p \?o solo, sin otro patrón que lo ancle/);
  });
  it("lo barato pasa: patrones unidos por variables, y un ?s ?p ?o anclado por otro patrón", () => {
    expect(
      validar(`${K_}SELECT * WHERE { ?u a ontologia:Uso ; ontologia:accion ?a . ?a a ontologia:Action }`, conocidas())
        .ok,
    ).toBe(true);
    expect(validar(`${K_}SELECT * WHERE { ?s ?p ?o . ?s a ontologia:Action }`, conocidas()).ok).toBe(true);
  });
  it("la plantilla de un CONSTRUCT puede inventar predicados; el WHERE no", () => {
    expect(validar(`${K_}CONSTRUCT { ?a ontologia:inventado ?b } WHERE { ?a ontologia:accion ?b }`, conocidas()).ok)
      .toBe(true);
  });
});

describe("variablesDelSelect", () => {
  it("las variables en el orden de la proyección, con las agregadas por su AS", () => {
    expect(variablesDelSelect(PREARMADAS[0].sparql)).toEqual(["accion", "usos"]);
    expect(variablesDelSelect(PREARMADAS[1].sparql)).toEqual(["proyecto", "accion", "usan", "otros"]);
    expect(variablesDelSelect("SELECT * WHERE { ?s ?p ?o }")).toEqual([]);
  });
});

describe("vistas", () => {
  it("cada id de grafo/… es una vista; uno desconocido cae al mapa", () => {
    expect(leerVista({ id: "grafo/huecos", valores: {} })).toMatchObject({ tipo: "prearmada" });
    expect(leerVista({ id: "grafo/consulta", valores: { sparql: "ASK {}" } })).toEqual({
      tipo: "consulta",
      sparql: "ASK {}",
    });
    expect(leerVista({ id: "grafo/nodo", valores: { iri: CHECKOUT } })).toMatchObject({ tipo: "nodo", iri: CHECKOUT });
    expect(leerVista({ id: "grafo/nada", valores: {} })).toEqual({ tipo: "mapa", clase: "" });
    expect(leerVista({ id: "grafo/nodo", valores: {} })).toEqual({ tipo: "mapa", clase: "" });
  });
});

describe("disposicion", () => {
  it("el sorteo del layout va con semilla: la misma secuencia cada vez, y Math.random vuelve a ser el de antes", () => {
    const azar = Math.random;
    const sortear = () => {
      const salida: number[] = [];
      conSemilla(() => salida.push(Math.random(), Math.random(), Math.random()));
      return salida;
    };
    expect(sortear()).toEqual(sortear());
    expect(Math.random).toBe(azar);
  });
});
