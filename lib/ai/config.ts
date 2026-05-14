/**
 * Configuración central de la IA interna (F4).
 *
 * Un solo lugar para los IDs de modelo y límites, así no quedan
 * hardcodeados en cada route.
 */

/** Modelo para el chat conversacional con tools. */
export const CHAT_MODEL = 'claude-sonnet-4-6'

/** Modelo para OCR de tickets (necesita visión). */
export const OCR_MODEL = 'claude-sonnet-4-6'

/** Modelo para el resumen ejecutivo diario. */
export const SUMMARY_MODEL = 'claude-sonnet-4-6'

/** Tope de tokens de salida por turno del chat. */
export const CHAT_MAX_TOKENS = 2048

/** Tope de tokens para el resumen diario. */
export const SUMMARY_MAX_TOKENS = 1500

/** Tope de tokens para la extracción OCR. */
export const OCR_MAX_TOKENS = 1024

/** Máximo de iteraciones del loop agéntico (Claude → tool → Claude). */
export const MAX_TOOL_ROUNDS = 5

/** Cuántos mensajes de historial se mandan al modelo. */
export const MAX_HISTORY_MESSAGES = 20
