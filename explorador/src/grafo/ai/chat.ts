// La conversación como la quiere la plantilla de chat de Gemma 4 (chat_template.jinja del repo del modelo). El system
// va como string: la plantilla le aplica `| trim`, y el jinja de Transformers.js no tiene trim para un array ("Unknown
// ArrayValue filter: trim"). User y assistant van en partes ({type: "text"}), como en DocsifyTemplate. La prueba
// renderiza la plantilla real (pruebas/datos/gemma-4-chat_template.jinja) con esto mismo.
import type { Mensaje } from "./protocolo.ts";

export interface ParteDeTexto {
  type: "text";
  text: string;
}

export type MensajeDeGemma =
  | { role: "system"; content: string }
  | { role: "user" | "assistant"; content: ParteDeTexto[] };

/** Lo que el worker le pasa a apply_chat_template además de los mensajes. enable_thinking va a la plantilla. */
export const OPCIONES_DE_PLANTILLA = { add_generation_prompt: true, enable_thinking: false } as const;

export function chatDeGemma(mensajes: Mensaje[]): MensajeDeGemma[] {
  return mensajes.map((m) =>
    m.role === "system"
      ? { role: "system", content: m.content }
      : { role: m.role, content: [{ type: "text", text: m.content }] }
  );
}
