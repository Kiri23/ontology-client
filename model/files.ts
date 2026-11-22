// files.ts — what a shape becomes: the graph of its class (`ontologia/<class>.ttl`) and the graph of its rules
// (`ontologia/<class>-reglas.ttl`), the two files the engine of ontologyLearning reads by their name. The Domain
// (model/domain.ts) calls these two functions and writes what they return.
//
// A property is declared once in the shape and lands in both: its domain and range in the class, its count, class or
// datatype in the rules. Both come out as a Graph, so `graph.store` is there to read or add to.

// @ts-types="@types/n3"
import { DataFactory, type Quad, type Quad_Object, type Quad_Subject } from "n3";
import { Graph, GraphNode } from "../graph.ts";
import { RDF, RDFS, SH, XSD } from "../vocabulary/names.ts";
import { parseTurtle } from "../vocabulary/turtle.ts";
import { DATATYPES, type ModelClass, type PropertyData, type ShapeData } from "./shape.ts";

const { blankNode, literal, namedNode, quad } = DataFactory;

/** What a shape needs from its domain to become files: where bare names go and the prefixes it knows. */
export interface Context {
  /** The prefix of the domain's namespace: `jardin`. */
  readonly prefix: string;
  readonly namespace: string;
  /** Every prefix it declares, its own included. */
  readonly prefixes: Readonly<Record<string, string>>;
}

/** Where the SHACL written by hand is parsed, before it goes on its node. */
const HERE = "urn:ontology-client:here";

/** The prefixes every generated file may use, besides the ones of the domain. */
const STANDARD = { rdf: RDF, rdfs: RDFS, sh: SH, xsd: XSD };

/** The class and its properties: `ontologia/<class>.ttl`. A property outside the domain's namespace is borrowed: not declared here. */
export function classGraph(shape: ShapeData, context: Context): Graph {
  const graph = empty(context);
  const name = className(shape.model);
  const owner = GraphNode.create(name).a("rdfs:Class");
  if (shape.label !== undefined) owner.value("rdfs:label", shape.label);
  if (shape.comment !== undefined) owner.value("rdfs:comment", shape.comment);
  graph.add(owner);
  for (const property of shape.properties) {
    const iri = graph.iri(property.predicate ?? property.key);
    if (!iri.startsWith(context.namespace)) continue;
    const node = GraphNode.create(iri).a("rdf:Property").link("rdfs:domain", name);
    const range = rangeOf(property);
    if (range !== undefined) node.link("rdfs:range", typeof range === "string" ? range : className(range));
    if (property.comment !== undefined) node.value("rdfs:comment", property.comment);
    graph.add(node);
  }
  return graph;
}

/**
 * The rules of the class: `ontologia/<class>-reglas.ttl`. One NodeShape, `<Class>Shape`, with a property shape per
 * property; each rule on the node written by hand is a NodeShape of its own (`<Class>Shape2`, `3`…), so its message
 * is its own.
 */
export function rulesGraph(shape: ShapeData, context: Context): Graph {
  const graph = empty(context);
  const name = className(shape.model);
  const main = namedNode(graph.iri(`${name}Shape`));
  graph.add(GraphNode.create(main.value).a("sh:NodeShape").link("sh:targetClass", name));
  const { store } = graph;
  const add = (subject: Quad_Subject, predicate: string, object: Quad_Object) =>
    store.addQuad(quad(subject, namedNode(predicate), object));

  if (shape.closed) {
    add(main, `${SH}closed`, literal("true", namedNode(`${XSD}boolean`)));
    add(main, `${SH}ignoredProperties`, list(store, [namedNode(`${RDF}type`)]));
    if (shape.closed.message !== undefined) add(main, `${SH}message`, literal(shape.closed.message));
  }
  for (const property of shape.properties) {
    const node = blankNode();
    add(main, `${SH}property`, node);
    add(node, `${SH}path`, namedNode(graph.iri(property.predicate ?? property.key)));
    add(node, `${SH}name`, literal(property.name ?? property.key));
    for (const [predicate, object] of constraintsOf(property, graph)) add(node, predicate, object);
    if (property.message !== undefined) add(node, `${SH}message`, literal(property.message));
    for (const turtle of property.shacl) raw(store, node, turtle, context, `${name}.${property.key}`);
  }
  shape.nodeRules.forEach((turtle, i) => {
    const rule = GraphNode.create(`${name}Shape${i + 2}`).a("sh:NodeShape").link("sh:targetClass", name);
    graph.add(rule);
    raw(store, namedNode(graph.iri(rule.id)), turtle, context, `${name} (rule ${i + 1})`);
  });
  return graph;
}

/** The name of a model's class, as the files write it: the name of the JavaScript class, in the domain's namespace. */
export function className(model: ModelClass | string): string {
  return typeof model === "string" ? model : model.name;
}

/** What the property asks of each value besides its count: its datatype, its class or classes, or just an IRI. */
function constraintsOf(property: PropertyData, graph: Graph): [string, Quad_Object][] {
  const constraints: [string, Quad_Object][] = [];
  const count = (n: number) => literal(String(n), namedNode(`${XSD}integer`));
  if (property.kind !== "link") {
    // A list of values already says which ones: the hand-written rules of Planta give `sh:in` and no datatype.
    if (property.oneOf === undefined) constraints.push([`${SH}datatype`, namedNode(DATATYPES[property.kind])]);
  } else if (property.targets.length === 0) {
    constraints.push([`${SH}nodeKind`, namedNode(`${SH}IRI`)]);
  } else if (property.targets.length === 1) {
    constraints.push([`${SH}class`, namedNode(graph.iri(className(property.targets[0])))]);
  } else {
    const store = graph.store;
    const options = property.targets.map((target) => {
      const option = blankNode();
      store.addQuad(quad(option, namedNode(`${SH}class`), namedNode(graph.iri(className(target)))));
      return option;
    });
    constraints.push([`${SH}or`, list(store, options)]);
  }
  if (property.min !== undefined) constraints.push([`${SH}minCount`, count(property.min)]);
  if (property.max !== undefined) constraints.push([`${SH}maxCount`, count(property.max)]);
  if (property.oneOf !== undefined) {
    const datatype = property.kind === "link" ? undefined : DATATYPES[property.kind];
    const values = property.oneOf.map((v) =>
      property.kind === "link" ? namedNode(graph.iri(String(v))) : valueLiteral(v, datatype!)
    );
    constraints.push([`${SH}in`, list(graph.store, values)]);
  }
  return constraints;
}

/** The `rdfs:range` of a property in the class file; none for a link to several classes, or to any IRI. */
function rangeOf(property: PropertyData): ModelClass | string | undefined {
  if (property.kind !== "link") return DATATYPES[property.kind];
  return property.targets.length === 1 ? property.targets[0] : undefined;
}

/** A value of a list (`sh:in`), as the literal a setter would write for it. */
function valueLiteral(value: string | number | boolean, datatype: string): Quad_Object {
  return datatype === `${XSD}string` ? literal(String(value)) : literal(String(value), namedNode(datatype));
}

/** Writes an RDF list in the store and returns its head. */
function list(store: Graph["store"], items: Quad_Object[]): Quad_Object {
  let rest: Quad_Object = namedNode(`${RDF}nil`);
  for (const item of [...items].reverse()) {
    const node = blankNode();
    store.addQuad(quad(node, namedNode(`${RDF}first`), item));
    store.addQuad(quad(node, namedNode(`${RDF}rest`), rest));
    rest = node;
  }
  return rest;
}

/** SHACL written by hand, put on `subject`. Throws naming where it was written when it is not Turtle. */
function raw(store: Graph["store"], subject: Quad_Subject, turtle: string, context: Context, where: string): void {
  const prefixes = Object.entries({ ...STANDARD, ...context.prefixes })
    .map(([p, ns]) => `@prefix ${p}: <${ns}> .`).join("\n");
  let quads: Quad[];
  try {
    quads = parseTurtle(`${prefixes}\n<${HERE}> ${turtle} .`).quads;
  } catch (error) {
    throw new Error(`${where}: the SHACL in .shacl() is not Turtle: ${(error as Error).message}`);
  }
  const here = (term: Quad["subject"] | Quad["object"]) => term.termType === "NamedNode" && term.value === HERE;
  for (const q of quads) {
    store.addQuad(quad(here(q.subject) ? subject : q.subject, q.predicate, here(q.object) ? subject : q.object));
  }
}

function empty(context: Context): Graph {
  const graph = Graph.create(context.namespace);
  for (const [prefix, namespace] of Object.entries({ [context.prefix]: context.namespace, ...STANDARD })) {
    graph.prefix(prefix, namespace);
  }
  for (const [prefix, namespace] of Object.entries(context.prefixes)) graph.prefix(prefix, namespace);
  return graph;
}
