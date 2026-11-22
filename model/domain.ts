// domain.ts — the module: it names the models, the queries and the instances of a domain, and generates their files.
// `create` builds it in memory; `write` and `check` touch the disk. The file that declares it is the one you run, so
// the consumer owns the pipeline: `if (import.meta.main) Deno.exit(jardin.main(Deno.args))`.
//
// It turns each model into two graphs with model/files.ts and its instances into a third with Graph.add (graph.ts).

import { Graph } from "../graph.ts";
import { RDF_TYPE } from "../vocabulary/names.ts";
import { classGraph, type Context, rulesGraph } from "./files.ts";
import type { Model, ModelWithShape } from "./model.ts";

/** Where instances go: one file for all of them, or a file chosen for each one. */
type Destination = string | ((instance: Model) => string);

/** The part of `node:fs` the domain uses: URLs in, text out. */
interface Disk {
  readFileSync(path: URL, encoding: "utf8"): string;
  writeFileSync(path: URL, text: string): void;
  mkdirSync(path: URL, options: { recursive: true }): void;
  existsSync(path: URL): boolean;
}

/** The instances named with one `.instances()`, and where they go. */
interface Group {
  readonly instances: readonly Model[];
  destination?: Destination;
}

/**
 * A domain: its namespace, its models, the queries written by hand next to them, and its instances. It is what you
 * run to generate the files the engine of ontologyLearning reads.
 *
 * ```ts
 * const jardin = Domain.create("jardin").at(import.meta)
 *   .namespace("https://github.com/Kiri23/ontology-ejemplo/jardin#")
 *   .model(Planta)
 *   .query("riego")
 *   .instances(plantas).in("plantas/plantas.ttl");
 *
 * if (import.meta.main) Deno.exit(jardin.main(Deno.args));
 * ```
 *
 * It writes, next to the file passed to `at`: `ontologia/planta.ttl` (the class), `ontologia/planta-reglas.ttl` (its
 * rules) and the instances where `in` says. The queries are not written: `ontologia/<name>.rq` has to be there.
 */
export class Domain {
  /** Its name, and the prefix of its namespace. */
  readonly name: string;
  #namespace?: string;
  #prefixes: Record<string, string> = {};
  #models: ModelWithShape[] = [];
  #queries: string[] = [];
  #groups: Group[] = [];
  #base?: URL;
  #source?: string;

  private constructor(name: string) {
    this.name = name;
  }

  /** A domain in memory. Its name is also the prefix of its namespace: `jardin:`. */
  static create(name: string): Domain {
    return new Domain(name);
  }

  /** The file that declares the domain: what it generates goes next to it. Pass `import.meta`. */
  at(meta: { url: string }): this {
    this.#base = new URL(".", meta.url);
    this.#source = meta.url.slice(this.#base.href.length);
    return this;
  }

  /** Where the classes, the properties and the bare names of the domain go. */
  namespace(iri: string): this {
    this.#namespace = iri;
    return this;
  }

  /** Declares another prefix, for classes or predicates borrowed from elsewhere: `.prefix("schema", "https://schema.org/")`. */
  prefix(name: string, namespace: string): this {
    this.#prefixes[name] = namespace;
    return this;
  }

  /** The models of the domain; each one becomes its class and its rules. */
  model(...models: ModelWithShape[]): this {
    this.#models.push(...models);
    return this;
  }

  /** The queries of the domain, by name: each one is `ontologia/<name>.rq`, written by hand. Generating checks it is there. */
  query(...names: string[]): this {
    for (const name of names) {
      if (!/^[\w-]+$/.test(name)) throw new Error(`"${name}" is not a query name: letters, digits, "-" and "_"`);
    }
    this.#queries.push(...names);
    return this;
  }

  /** Instances of its models, made with `Model.create`. They go to `<name>.ttl` unless `in` says where. */
  instances(instances: readonly Model[]): this {
    this.#groups.push({ instances });
    return this;
  }

  /**
   * Where the instances of the last `instances()` go, relative to the file of `at`: one file
   * (`"plantas/plantas.ttl"`), or one for each, from the instance (`(c) => \`cursos/${c.id}.ttl\``).
   */
  in(destination: Destination): this {
    const group = this.#groups.at(-1);
    if (!group) throw new Error(`${this.name}: in() says where the instances go; name them first with .instances()`);
    group.destination = destination;
    return this;
  }

  /**
   * Every file it generates, as graphs, by path relative to the file of `at`. Nothing is written: read them, or add
   * to their `store` before you write them yourself.
   */
  graphs(): Map<string, Graph> {
    const context = this.#context();
    const graphs = new Map<string, Graph>();
    for (const model of this.#models) {
      const file = `ontologia/${model.name.toLowerCase()}`;
      graphs.set(`${file}.ttl`, classGraph(model.shape.data, context));
      graphs.set(`${file}-reglas.ttl`, rulesGraph(model.shape.data, context));
    }
    for (const group of this.#groups) {
      for (const instance of group.instances) {
        const path = this.#destination(group, instance);
        const graph = graphs.get(path) ?? this.#instanceGraph(context);
        graph.add(instance);
        graphs.set(path, graph);
      }
    }
    for (const graph of graphs.values()) this.#checkClosed(graph);
    return graphs;
  }

  /** Every file it generates, as text, by path. A header says where it comes from. */
  files(): Map<string, string> {
    const header =
      `# Generated from ${this.#source ?? `the domain "${this.name}"`} by @kiri23/ontology-client/model. ` +
      "Edit the .ts, not this file.\n";
    return new Map([...this.graphs()].map(([path, graph]) => [path, header + graph.toTurtle()]));
  }

  /** Writes every file and returns their paths. Throws, writing nothing, if a query has no `.rq`. */
  write(): string[] {
    const files = this.#checked();
    const disk = this.#disk();
    for (const [path, text] of files) {
      const url = this.#url(path);
      disk.mkdirSync(new URL(".", url), { recursive: true });
      disk.writeFileSync(url, text);
    }
    return [...files.keys()];
  }

  /** The paths of the files that generating would create or change; none when they are up to date. */
  check(): string[] {
    const disk = this.#disk();
    return [...this.#checked()].filter(([path, text]) => {
      const url = this.#url(path);
      return !disk.existsSync(url) || disk.readFileSync(url, "utf8") !== text;
    }).map(([path]) => path);
  }

  /**
   * What the file of the domain runs: with `--check`, says which files would change and returns 1 if any; with
   * nothing, writes them and returns 0. `if (import.meta.main) Deno.exit(jardin.main(Deno.args))`.
   */
  main(args: readonly string[]): number {
    if (args.includes("--check")) {
      const stale = this.check();
      for (const path of stale) console.error(`${path} is not up to date: run ${this.#source ?? "the domain"}`);
      return stale.length ? 1 : 0;
    }
    for (const path of this.write()) console.log(`wrote ${path}`);
    return 0;
  }

  #context(): Context {
    if (this.#namespace === undefined) throw new Error(`${this.name}: say its namespace with .namespace()`);
    return {
      prefix: this.name,
      namespace: this.#namespace,
      prefixes: { [this.name]: this.#namespace, ...this.#prefixes },
    };
  }

  #instanceGraph(context: Context): Graph {
    const graph = Graph.create(context.namespace);
    for (const [prefix, namespace] of Object.entries(context.prefixes)) graph.prefix(prefix, namespace);
    for (const model of this.#models) {
      const { instancesIn } = model.shape.data;
      if (instancesIn !== undefined) graph.prefix(model.name.toLowerCase(), instancesIn);
    }
    return graph;
  }

  #destination(group: Group, instance: Model): string {
    const { destination = `${this.name}.ttl` } = group;
    const path = typeof destination === "string" ? destination : destination(instance);
    if (path.split("/").includes("..") || path.startsWith("/")) {
      throw new Error(`${this.name}: "${path}" leaves the folder of the domain; instances go inside it`);
    }
    return path;
  }

  /** An instance of a closed model with a property its shape does not declare throws here, not when the engine validates. */
  #checkClosed(graph: Graph): void {
    for (const model of this.#models) {
      const { data } = model.shape;
      if (!data.closed) continue;
      const allowed = new Set([RDF_TYPE, ...data.properties.map((p) => graph.iri(p.predicate ?? p.key))]);
      for (const instance of graph.instancesOf(graph.iri(model.name))) {
        const extra = graph.store.getQuads(instance.node, null, null, null).find((q) =>
          !allowed.has(q.predicate.value)
        );
        if (extra) {
          throw new Error(
            `${instance.id} writes <${extra.predicate.value}>, and ${model.name} is closed: declare it in its shape, ` +
              "or do not write it (label() writes skos:prefLabel)",
          );
        }
      }
    }
  }

  #checked(): Map<string, string> {
    const files = this.files();
    const disk = this.#disk();
    const missing = this.#queries.filter((name) => !disk.existsSync(this.#url(`ontologia/${name}.rq`)));
    if (missing.length) {
      throw new Error(`${this.name}: no ontologia/${missing[0]}.rq next to ${this.#source}; write the query by hand`);
    }
    return files;
  }

  #url(path: string): URL {
    if (!this.#base) throw new Error(`${this.name}: say where it lives with .at(import.meta) before writing`);
    return new URL(path, this.#base);
  }

  #disk(): Disk {
    const { process } = globalThis as { process?: { getBuiltinModule?: (name: string) => unknown } };
    const fs = process?.getBuiltinModule?.("node:fs");
    if (!fs) throw new Error(`${this.name}: write and check need the disk of Deno or Node; use files() anywhere else`);
    return fs as Disk;
  }
}
