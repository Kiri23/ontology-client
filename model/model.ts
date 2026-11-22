// model.ts — the base of a model: a class of your repo whose `static shape` says what it is (model/shape.ts), and
// whose instances are nodes of a graph (graph/node.ts) with one setter per property of the shape.
//
// `Planta.withId("pothos")` builds the node in memory and gives it its setters; the Domain (model/domain.ts) puts it
// in a graph when it generates, and only there the names become IRIs, as with any GraphNode.

import { GraphNode } from "../graph/node.ts";
import { RDF_TYPE } from "../vocabulary/names.ts";
import { DATATYPES, type Declared, type PropertyData, type Props } from "./shape.ts";

/** A model class with its shape: what `withId` needs. */
export interface ModelWithShape {
  new (id: string): Model;
  readonly name: string;
  readonly shape: Declared<Props>;
}

/** The properties a model's shape declares, as a type. */
type PropsOf<C> = C extends { shape: Declared<infer P> } ? P : never;

/** An instance of a model: the node, plus one setter per property. Each setter takes the values and returns it. */
export type Instance<C extends ModelWithShape> =
  & InstanceType<C>
  & { [K in keyof PropsOf<C>]: (...values: PropsOf<C>[K][]) => Instance<C> };

/**
 * A model: a class of your repo, its properties and what is asked of each, in one place. The class and its rules are
 * generated from it, and its instances are written with it.
 *
 * ```ts
 * class Planta extends Model {
 *   static shape = Shape.of(Planta)
 *     .label("Planta")
 *     .integer("riegoCadaDias").exactly(1);
 * }
 * Planta.withId("pothos").riegoCadaDias(7);
 * ```
 *
 * A model that points to another declared further down names it (`.to("Persona")`): the class does not exist yet
 * when the `static` runs.
 */
export class Model extends GraphNode {
  /**
   * An instance in memory, typed after the class, with a setter per property of its shape. It is in no file until
   * the Domain that names the model generates.
   *
   * Its name goes where the shape's `instanceNamespace` says; without one, in the namespace of the domain.
   */
  static override withId<C extends ModelWithShape>(this: C, id: string): Instance<C> {
    const { data } = this.shape;
    const bare = !id.includes(":");
    const node = new this(bare && data.instanceNamespace ? data.instanceNamespace + id : id);
    const type = this.name;
    node.write((editor) => editor.link(RDF_TYPE, type));
    const setters = node as unknown as Record<string, (...values: unknown[]) => Model>;
    for (const property of data.properties) {
      setters[property.key] = (...values: unknown[]) => {
        for (const value of values) node.write((editor) => writeValue(editor, property, value));
        return node;
      };
    }
    return node as Instance<C>;
  }
}

/** How a setter writes one value, with the editor of the graph that takes the node. */
function writeValue(editor: Parameters<GraphNode["writeWith"]>[0], property: PropertyData, value: unknown): void {
  const predicate = editor.vocabulary.iri(property.writtenAs ?? property.key);
  if (property.kind === "link") {
    editor.link(predicate, typeof value === "string" ? value : (value as { id: string }).id);
  } else if (property.kind === "text") {
    editor.value(predicate, String(value));
  } else {
    editor.typedValue(predicate, String(value), DATATYPES[property.kind]);
  }
}
