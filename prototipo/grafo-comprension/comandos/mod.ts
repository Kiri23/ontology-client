// mod.ts — el índice de comandos: lo que lee el CLI (`grafo <comando>`) y lo que el MCP publica en tools/list.

import type { Comando } from "../lib/comando.ts";
import { archivo } from "./archivo.ts";
import { backtracking } from "./backtracking.ts";
import { buscar } from "./buscar.ts";
import { capas } from "./capas.ts";
import { cypher } from "./cypher.ts";
import { decide } from "./decide.ts";
import { pr } from "./pr.ts";

export const COMANDOS: Comando[] = [buscar, archivo, backtracking, pr, decide, capas, cypher];
