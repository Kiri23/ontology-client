// Tests de lo que `deno task contrato` acepta como contrato. Que generado/ esté al día lo chequea CI
// con `deno task generar --check`.

import { assertEquals } from "@std/assert";
import { validarContrato } from "../scripts/contrato.ts";

Deno.test("validarContrato: el contrato commiteado pasa y queda igual", async () => {
  const texto = await Deno.readTextFile(new URL("../contrato/openapi.json", import.meta.url));
  assertEquals(validarContrato(texto), { contrato: texto });
});

Deno.test("validarContrato: rechaza lo que no es el contrato", () => {
  assertEquals(validarContrato("<html>"), { error: "la respuesta no es JSON" });
  assertEquals(validarContrato("{}"), { error: "no es un contrato OpenAPI 3.x (falta el campo openapi)" });
  assertEquals(validarContrato('{"openapi": "3.1.0", "paths": {}}'), { error: "el contrato no tiene POST /proyectos" });
});
