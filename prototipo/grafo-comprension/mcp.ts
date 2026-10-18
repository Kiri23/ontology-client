// mcp.ts — el grafo de comprensión como servidor MCP por stdio: cada comando de comandos/ es una tool. Mismo motor
// que el CLI grafo.ts; esto es solo el transporte para clientes sin shell (claude.ai, Hermes, el teléfono).
//
// JSON-RPC 2.0 por líneas (una por mensaje), escrito a mano porque son cuatro métodos y deno.lock está congelado:
// initialize, notifications/initialized, ping, tools/list y tools/call. Se registra en Claude Code con
//   claude mcp add -s user grafo-comprension -- doppler run -p ontology -c dev -- env -u LD_PRELOAD deno run … mcp.ts

import type { Driver } from "neo4j-driver";
import type { Parametro } from "./lib/comando.ts";
import { COMANDOS } from "./comandos/mod.ts";
import { abrir, URL_NEO4J } from "./lib/db.ts";

interface Pedido {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

const esquema = (parametros: Parametro[]) => ({
  type: "object",
  properties: Object.fromEntries(parametros.map((p) => [p.nombre, { type: p.tipo, description: p.descripcion }])),
  required: parametros.filter((p) => p.requerido).map((p) => p.nombre),
});

const INSTRUCCIONES =
  "Grafo de comprensión del repo ontology-client (Kiri23). El grafo guarda índice, no significado: " +
  "cada respuesta trae anclas archivo:línea, PR o sha; leé el archivo en el ancla para saber el por qué. Empezá por " +
  "`buscar` para encontrar la ruta exacta, `archivo` para la ficha, `backtracking` para qué hay debajo, `decide` para " +
  "ir de un comportamiento visible del explorador al archivo que lo decide, `pr` para qué hizo el agente en un PR, " +
  "`capas` para los imports contra la arquitectura, y `cypher` para lo demás.";

let db: Driver | undefined;
const conectar = (): Driver => db ??= abrir();

async function atender(p: Pedido): Promise<unknown> {
  switch (p.method) {
    case "initialize":
      return {
        protocolVersion: String(p.params?.protocolVersion ?? "2025-06-18"),
        capabilities: { tools: {} },
        serverInfo: { name: "grafo-comprension", version: "0.1.0" },
        instructions: INSTRUCCIONES,
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: COMANDOS.map((c) => ({
          name: c.nombre,
          description: c.descripcion,
          inputSchema: esquema(c.parametros),
        })),
      };
    case "tools/call": {
      const nombre = String(p.params?.name ?? "");
      const comando = COMANDOS.find((c) => c.nombre === nombre);
      if (!comando) throw Object.assign(new Error(`tool desconocida: ${nombre}`), { codigo: -32602 });
      const args = (p.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const texto = await comando.correr(args, conectar());
        return { content: [{ type: "text", text: texto }] };
      } catch (e) {
        return { content: [{ type: "text", text: `error: ${String(e)} (Neo4j en ${URL_NEO4J})` }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`método desconocido: ${p.method}`), { codigo: -32601 });
  }
}

const salida = new TextEncoder();
const responder = (m: unknown) => Deno.stdout.write(salida.encode(JSON.stringify(m) + "\n"));

let resto = "";
for await (const trozo of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
  resto += trozo;
  let corte;
  while ((corte = resto.indexOf("\n")) >= 0) {
    const linea = resto.slice(0, corte).trim();
    resto = resto.slice(corte + 1);
    if (!linea) continue;
    let pedido: Pedido;
    try {
      pedido = JSON.parse(linea);
    } catch {
      await responder({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } });
      continue;
    }
    if (pedido.method?.startsWith("notifications/")) continue; // sin respuesta, por protocolo
    try {
      await responder({ jsonrpc: "2.0", id: pedido.id ?? null, result: await atender(pedido) });
    } catch (e) {
      const codigo = (e as { codigo?: number }).codigo ?? -32603;
      await responder({
        jsonrpc: "2.0",
        id: pedido.id ?? null,
        error: { code: codigo, message: String((e as Error).message) },
      });
    }
  }
}
if (db) await (db as Driver).close();
