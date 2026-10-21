// El catálogo: las clases del SDK en el orden de la barra lateral. Una función nueva en mod.ts necesita su historia
// en una de estas clases (o una clase nueva acá); si no, falla tests/explorador.test.ts en la raíz.
import { CLIENTE } from "./cliente.ts";
import { JOBS } from "./jobs.ts";
import { MOTOR } from "./motor.ts";
import { PROYECTOS } from "./proyectos.ts";
import { SPARQL } from "./sparql.ts";
import { VOCABULARIOS } from "./vocabularios.ts";
import type { Clase, Historia } from "./tipos.ts";

export const CLASES: Clase[] = [JOBS, PROYECTOS, VOCABULARIOS, SPARQL, MOTOR, CLIENTE];

export const HISTORIAS: Historia[] = CLASES.flatMap((c) => c.historias);

export function buscarHistoria(id: string): Historia | undefined {
  return HISTORIAS.find((h) => h.id === id);
}

export type { Clase, Control, Historia, Token, Valores } from "./tipos.ts";
