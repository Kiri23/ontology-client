// shape.ts — the shape of a model: what its class is, which properties it has and what is asked of each. It is the
// `static shape` of a Model (model/model.ts), it keeps only data, and model/files.ts turns that data
// into the two files. Nothing here writes Turtle.
//
// The chain is flat but has levels, and the types say which one you are in: first the class (label, comment, …),
// then one property after another (each opened by `text`, `integer`, `link`…). Once in the properties, `comment`
// and `message` are about the property that was opened last.
//
// To add a kind of property, add it to DATATYPES (a literal) or follow `link` (a resource), and a method that opens it.

import { XSD } from "../vocabulary/names.ts";

/** A model class, as a shape needs it: something with a name that builds its instances. */
// deno-lint-ignore no-explicit-any
export type ModelClass = abstract new (...args: any[]) => unknown;

/** What a property declares, as data. */
export interface PropertyData {
  /** The name it has in code: the method that writes it on an instance, and its `sh:name` unless `name()` says one. */
  readonly key: string;
  /** What kind of value it takes: a literal of DATATYPES, a link to a resource of some classes, or any IRI. */
  readonly kind: keyof typeof DATATYPES | "link";
  predicate?: string;
  name?: string;
  comment?: string;
  min?: number;
  max?: number;
  /** For a link: the classes it may point to, as model classes or names. None: any IRI. */
  targets: (ModelClass | string)[];
  /** The only values it admits (`sh:in`), when it says so. */
  oneOf?: (string | number | boolean)[];
  message?: string;
  /** SHACL written by hand, as Turtle, for what the builder does not cover. */
  shacl: string[];
}

/** What a shape declares, as data. */
export interface ShapeData {
  /** The model it is the shape of. */
  readonly model: ModelClass;
  label?: string;
  comment?: string;
  /** Where the IRIs of its instances go: `Planta.create("pothos")` is `<instancesIn>pothos`. */
  instancesIn?: string;
  /** Present when the class admits no property it does not declare. */
  closed?: { message?: string };
  /** Rules on the whole node written by hand, as Turtle: each one is a NodeShape of its own, with its own message. */
  readonly nodeRules: string[];
  readonly properties: PropertyData[];
}

/** The datatype of each kind of literal property, and the type of the value its setter takes. */
export const DATATYPES = {
  text: `${XSD}string`,
  integer: `${XSD}integer`,
  decimal: `${XSD}decimal`,
  boolean: `${XSD}boolean`,
  date: `${XSD}date`,
} as const;

/** The value a model's setter takes for each kind: a link takes the name of a resource, or an instance. */
interface ValueOf {
  text: string;
  integer: number;
  decimal: number;
  boolean: boolean;
  date: string;
  link: string | { readonly id: string };
}

/** The setters of a model's instances, as a type: one per property, named after its key. */
export type Props = Record<string, unknown>;

/** Every level of the chain carries the properties declared so far; `Model.create` reads them from here. */
export interface Declared<P extends Props> {
  /** The data of the shape. */
  readonly data: ShapeData;
  /** Only for the types: the properties declared so far. It has no value. */
  readonly props?: P;
}

/** The methods that open a property; every level has them, so the next property can start anywhere. */
export interface Opens<P extends Props> extends Declared<P> {
  /** A text: `xsd:string`, written with no language. */
  text<K extends string>(key: K): PropertyLevel<P & Record<K, string>, K>;
  /** An integer: `xsd:integer`. */
  integer<K extends string>(key: K): PropertyLevel<P & Record<K, number>, K>;
  /** A decimal number: `xsd:decimal`. */
  decimal<K extends string>(key: K): PropertyLevel<P & Record<K, number>, K>;
  /** True or false: `xsd:boolean`. */
  boolean<K extends string>(key: K): PropertyLevel<P & Record<K, boolean>, K>;
  /** A date, written `"2026-11-21"`: `xsd:date`. */
  date<K extends string>(key: K): PropertyLevel<P & Record<K, string>, K>;
  /** A link to another resource. Say to which classes with `.to()`; without it, any IRI. */
  link<K extends string>(key: K): PropertyLevel<P & Record<K, ValueOf["link"]>, K>;
  /**
   * The class admits no property it does not declare (`sh:closed`). Its type is always allowed. Generating throws if
   * an instance writes something else.
   */
  closed(): ClosedLevel<P>;
}

/** The first level: the class itself. */
export interface ClassLevel<P extends Props> extends Opens<P> {
  /** The name of the class for a person (`rdfs:label`). */
  label(text: string): ClassLevel<P>;
  /** What the class is, in a sentence (`rdfs:comment`). */
  comment(text: string): ClassLevel<P>;
  /** Where the IRIs of its instances go: `.instancesIn("https://example.com/plant/")`. It writes no statement. */
  instancesIn(namespace: string): ClassLevel<P>;
  /**
   * A rule on the whole node that the builder does not cover, as Turtle: what goes after the subject, with the
   * prefixes of the domain and `sh:`, `xsd:`, `rdf:`, `rdfs:`. It becomes a NodeShape of its own, so its
   * `sh:message` is its own: `.shacl('sh:not [ sh:class ex:Project ] ; sh:message "A course is not a project."')`.
   */
  shacl(turtle: string): ClassLevel<P>;
}

/** The level of one property, the one opened last. */
export interface PropertyLevel<P extends Props, K extends string> extends Opens<P> {
  /** The predicate it is written with, when it is not `<namespace of the domain><key>`: `.predicate("rdfs:label")`. */
  predicate(name: string): PropertyLevel<P, K>;
  /** Its name for a person (`sh:name`), when it is not the key. */
  name(text: string): PropertyLevel<P, K>;
  /** What it is, in a sentence (`rdfs:comment` in the class file). */
  comment(text: string): PropertyLevel<P, K>;
  /** Exactly this many values. */
  exactly(count: number): PropertyLevel<P, K>;
  /** This many values or more. */
  atLeast(count: number): PropertyLevel<P, K>;
  /** This many values or fewer. */
  atMost(count: number): PropertyLevel<P, K>;
  /** For a link, the classes it may point to: model classes, or names like `"skos:Concept"`. */
  to(...classes: (ModelClass | string)[]): PropertyLevel<P, K>;
  /** The only values it admits (`sh:in`). The setter then takes only those. */
  oneOf<V extends P[K]>(...values: V[]): PropertyLevel<Omit<P, K> & Record<K, V>, K>;
  /** What the report says when a value breaks a rule of this property (`sh:message`). */
  message(text: string): PropertyLevel<P, K>;
  /**
   * A rule the builder does not cover, as Turtle: what goes inside the property shape, with the prefixes of the domain
   * and `sh:`, `xsd:`, `rdf:`, `rdfs:`. `.shacl("sh:minInclusive 1")`.
   */
  shacl(turtle: string): PropertyLevel<P, K>;
}

/** The level right after `closed()`. */
export interface ClosedLevel<P extends Props> extends Opens<P> {
  /** What the report says when an instance has a property the class does not declare. */
  message(text: string): ClosedLevel<P>;
}

/** Keys that are already methods of every instance: a property named like one would hide it. */
const TAKEN = new Set([
  "id",
  "a",
  "label",
  "definition",
  "seeAlso",
  "value",
  "link",
  "write",
  "writeWith",
  "constructor",
]);

/**
 * The shape of a model: its class, its properties and what is asked of each.
 *
 * ```ts
 * class Planta extends Model {
 *   static shape = Shape.of(Planta)
 *     .label("Planta")
 *     .integer("riegoCadaDias").exactly(1).comment("Cada cuántos días se riega.")
 *     .text("luz").exactly(1).oneOf("sol", "media", "sombra");
 * }
 * ```
 */
export class Shape {
  /** The data of the shape, read by the files it becomes. */
  readonly data: ShapeData;
  #current?: PropertyData;
  #level: "class" | "property" | "closed" = "class";

  private constructor(model: ModelClass) {
    this.data = { model, nodeRules: [], properties: [] };
  }

  /** The shape of a model, written inside it: `static shape = Shape.of(Planta)…`. */
  static of(model: ModelClass): ClassLevel<Record<never, never>> {
    return new Shape(model) as unknown as ClassLevel<Record<never, never>>;
  }

  label(text: string): this {
    this.#at("class", "label").label = text;
    return this;
  }

  comment(text: string): this {
    if (this.#level === "property") this.#property("comment").comment = text;
    else this.#at("class", "comment").comment = text;
    return this;
  }

  instancesIn(namespace: string): this {
    this.#at("class", "instancesIn").instancesIn = namespace;
    return this;
  }

  shacl(turtle: string): this {
    if (this.#level === "property") this.#property("shacl").shacl.push(turtle);
    else this.#at("class", "shacl").nodeRules.push(turtle);
    return this;
  }

  closed(): this {
    if (this.data.closed) throw new Error(`${this.#name}: closed() is said once`);
    this.data.closed = {};
    this.#level = "closed";
    return this;
  }

  text(key: string): this {
    return this.#open(key, "text");
  }

  integer(key: string): this {
    return this.#open(key, "integer");
  }

  decimal(key: string): this {
    return this.#open(key, "decimal");
  }

  boolean(key: string): this {
    return this.#open(key, "boolean");
  }

  date(key: string): this {
    return this.#open(key, "date");
  }

  link(key: string): this {
    return this.#open(key, "link");
  }

  predicate(name: string): this {
    this.#property("predicate").predicate = name;
    return this;
  }

  name(text: string): this {
    this.#property("name").name = text;
    return this;
  }

  exactly(count: number): this {
    const property = this.#property("exactly");
    property.min = property.max = count;
    return this;
  }

  atLeast(count: number): this {
    this.#property("atLeast").min = count;
    return this;
  }

  atMost(count: number): this {
    this.#property("atMost").max = count;
    return this;
  }

  to(...classes: (ModelClass | string)[]): this {
    const property = this.#property("to");
    if (property.kind !== "link") {
      throw new Error(`${this.#name}.${property.key}: to() is for a link; "${property.key}" is ${property.kind}`);
    }
    property.targets.push(...classes);
    return this;
  }

  oneOf(...values: (string | number | boolean)[]): this {
    this.#property("oneOf").oneOf = values;
    return this;
  }

  message(text: string): this {
    if (this.#level === "closed") this.data.closed!.message = text;
    else this.#property("message").message = text;
    return this;
  }

  get #name(): string {
    return this.data.model.name;
  }

  #open(key: string, kind: PropertyData["kind"]): this {
    if (TAKEN.has(key)) {
      throw new Error(
        `${this.#name}: "${key}" is already a method of every instance. Give the property another key and say its ` +
          `predicate: .${kind}("my${key[0].toUpperCase()}${key.slice(1)}").predicate("…")`,
      );
    }
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(key)) {
      throw new Error(`${this.#name}: "${key}" is not a name a method can have; say its predicate with .predicate()`);
    }
    if (this.data.properties.some((p) => p.key === key)) throw new Error(`${this.#name}: "${key}" is declared twice`);
    this.#current = { key, kind, targets: [], shacl: [] };
    this.data.properties.push(this.#current);
    this.#level = "property";
    return this;
  }

  #property(method: string): PropertyData {
    if (this.#level !== "property" || !this.#current) {
      throw new Error(`${this.#name}: ${method}() is about a property; open one first with .text(), .link()…`);
    }
    return this.#current;
  }

  #at(level: "class", method: string): ShapeData {
    if (this.#level !== level) {
      throw new Error(`${this.#name}: ${method}() is about the class; say it before the first property`);
    }
    return this.data;
  }
}
