// La plantilla de chat real de Gemma 3 (chat_template.jinja de onnx-community/gemma-3-270m-it-ONNX, sha256 7de1c58e…),
// renderizada con @huggingface/jinja como lo hace Transformers.js. Corre en Node sin el modelo: prueba que el worker
// arma una conversación que la plantilla acepta.
import { Template } from "@huggingface/jinja";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPCIONES_DE_PLANTILLA } from "../src/grafo/ai/chat.ts";
import type { Mensaje } from "../src/grafo/ai/protocolo.ts";

const plantilla = new Template(readFileSync(resolve("pruebas/datos/gemma-3-chat_template.jinja"), "utf8"));

/** El prompt que vería el modelo para estos mensajes, con las opciones del worker. Tira si la plantilla falla. */
export function renderizarParaGemma(mensajes: Mensaje[]): string {
  return plantilla.render({ messages: mensajes, ...OPCIONES_DE_PLANTILLA, bos_token: "<bos>" });
}
