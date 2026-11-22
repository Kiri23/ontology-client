/**
 * A model as code: a class of your domain, its properties and its rules declared once in TypeScript, and the Turtle
 * and SHACL the engine of ontologyLearning reads generated from it.
 *
 * ```ts
 * import { Domain, Model, Shape } from "jsr:@kiri23/ontology-client/model";
 *
 * class Planta extends Model {
 *   static shape = Shape.of(Planta)
 *     .label("Planta")
 *     .instanceNamespace("https://github.com/Kiri23/ontology-ejemplo/planta/")
 *     .integer("riegoCadaDias").exactly(1).comment("Cada cuántos días se riega.")
 *     .text("luz").exactly(1).oneOf("sol", "media", "sombra");
 * }
 *
 * const jardin = Domain.named("jardin").inFolderOf(import.meta)
 *   .namespace("https://github.com/Kiri23/ontology-ejemplo/jardin#")
 *   .model(Planta)
 *   .instances([Planta.withId("pothos").riegoCadaDias(7).luz("media")]).toFile("plantas/plantas.ttl");
 *
 * if (import.meta.main) Deno.exit(jardin.runCli(Deno.args)); // writes ontologia/planta.ttl and planta-reglas.ttl
 * ```
 *
 * Three pieces: a {@link Model} (your class; its instances are GraphNodes of ./graph), its {@link Shape} (what the
 * class is and what is asked of it) and a {@link Domain} (the module that names models, queries and instances, and
 * generates). The queries stay in `.rq` files written by hand; the domain only names them.
 *
 * In Deno, n3 needs `--allow-env=READABLE_STREAM`; generating needs `--allow-read` and `--allow-write`.
 *
 * @module
 */

// model.ts — the entry `./model` of the package. It is built on ./graph: the files come out as Graph, the instances
// are GraphNodes. Nothing here is re-exported from mod.ts, so the client does not load n3.

export { Domain } from "./model/domain.ts";
export { type Instance, Model, type ModelWithShape } from "./model/model.ts";
export {
  type ClassLevel,
  type ClosedLevel,
  type Declared,
  type ModelClass,
  type Opens,
  type PropertyData,
  type PropertyLevel,
  type Props,
  Shape,
  type ShapeData,
} from "./model/shape.ts";
