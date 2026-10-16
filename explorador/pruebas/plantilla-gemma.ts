// La plantilla de chat real de Gemma 4 (chat_template.jinja de onnx-community/gemma-4-E2B-it-ONNX, sha256 781d1094…),
// renderizada con @huggingface/jinja como lo hace Transformers.js. Corre en Node sin el modelo: prueba que el worker
// arma una conversación que la plantilla acepta.
import { Template } from "@huggingface/jinja";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chatDeGemma, OPCIONES_DE_PLANTILLA } from "../src/grafo/ai/chat.ts";
import type { Mensaje } from "../src/grafo/ai/protocolo.ts";

const plantilla = new Template(readFileSync(resolve("pruebas/datos/gemma-4-chat_template.jinja"), "utf8"));

/** El prompt que vería el modelo para estos mensajes, armados como los arma el worker. Tira si la plantilla falla. */
export function renderizarParaGemma(mensajes: Mensaje[]): string {
  return plantilla.render({ messages: chatDeGemma(mensajes), ...OPCIONES_DE_PLANTILLA, bos_token: "<bos>" });
}
