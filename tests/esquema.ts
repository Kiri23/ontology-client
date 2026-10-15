// esquema.ts — el chequeo de forma contra el contrato (contrato/openapi.json), compartido por los tests de jobs.get()
// con cualquier motor. Lo valida @cfworker/json-schema (JSON Schema 2020-12, sin dependencias, solo en los tests):
// entiende las claves al lado de un $ref, allOf, additionalProperties y unevaluatedProperties, que el contrato puede
// usar para cerrar JobPost.

import { type Schema, Validator } from "@cfworker/json-schema";

// El contrato entero entra como documento, con una URI inventada de base: así sus $ref
// (#/components/schemas/JobPost) resuelven dentro de él. La raíz apunta al schema del 200 de GET /jobs.
const BASE = "https://contrato.invalid/openapi.json";
const contrato = JSON.parse(await Deno.readTextFile(new URL("../contrato/openapi.json", import.meta.url)));
const validador = new Validator(
  { $ref: `${BASE}#/paths/~1jobs/get/responses/200/content/application~1json/schema` },
  "2020-12",
  false,
);
validador.addSchema(contrato as Schema, BASE);

/** Lo que no calza de `valor` con el 200 de GET /jobs, cada cosa con su ruta. [] si calza. */
export function problemas(valor: unknown): string[] {
  return validador.validate(valor).errors.map((e) => `${e.instanceLocation} ${e.keyword}: ${e.error}`);
}
