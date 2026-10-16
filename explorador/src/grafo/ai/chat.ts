// La conversación como la quiere la plantilla de chat de Gemma 3 (chat_template.jinja del repo del modelo). Los
// mensajes van tal cual, con `content` como string: la plantilla pega el system al primer turno de user, pasa assistant
// a `model` y le aplica `| trim` a cada string. No tiene `enable_thinking`. La prueba renderiza la plantilla real
// (pruebas/datos/gemma-3-chat_template.jinja) con estas mismas opciones.

/**
 * Lo que el worker le pasa a apply_chat_template además de los mensajes: el turno del modelo abierto, y el resultado
 * tokenizado como diccionario (`input_ids` y `attention_mask`) para pasárselo a generate. Al tokenizar,
 * apply_chat_template no agrega special tokens: el `<bos>` lo pone la plantilla una sola vez.
 */
export const OPCIONES_DE_PLANTILLA = { add_generation_prompt: true, return_dict: true } as const;
