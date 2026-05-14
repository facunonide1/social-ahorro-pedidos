import { getAnthropic } from '@/lib/ai/client'
import { ocrTicketSystemPrompt } from '@/lib/ai/prompts'
import { OCR_MODEL, OCR_MAX_TOKENS } from '@/lib/ai/config'

export type OcrTicketResult = {
  fecha_ticket: string | null
  total: number | null
  comercio: string | null
  sucursal: string | null
  numero_ticket: string | null
  items_detectados: number
  legible: boolean
  confianza: 'alta' | 'media' | 'baja'
  observaciones: string | null
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type TicketMediaType = (typeof MEDIA_TYPES)[number]

export function isSupportedMediaType(t: string): t is TicketMediaType {
  return (MEDIA_TYPES as readonly string[]).includes(t)
}

/**
 * Manda la foto del ticket a Claude con visión y parsea la respuesta
 * JSON. Si el modelo no devuelve JSON válido, marca el ticket como
 * ilegible en vez de explotar (F4.7).
 */
export async function extraerDatosTicket(
  base64: string,
  mediaType: TicketMediaType,
): Promise<OcrTicketResult> {
  const anthropic = getAnthropic()
  const msg = await anthropic.messages.create({
    model: OCR_MODEL,
    max_tokens: OCR_MAX_TOKENS,
    system: ocrTicketSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: 'Extraé los datos de este ticket y devolvé solo el JSON.',
          },
        ],
      },
    ],
  })

  const text = msg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  return parseOcrResponse(text)
}

function parseOcrResponse(text: string): OcrTicketResult {
  const fallback: OcrTicketResult = {
    fecha_ticket: null,
    total: null,
    comercio: null,
    sucursal: null,
    numero_ticket: null,
    items_detectados: 0,
    legible: false,
    confianza: 'baja',
    observaciones: 'No se pudo interpretar la respuesta del OCR.',
  }
  // El modelo a veces envuelve en ```json … ```; sacamos las fences.
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return fallback
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1))
    return {
      fecha_ticket: typeof raw.fecha_ticket === 'string' ? raw.fecha_ticket : null,
      total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : null,
      comercio: typeof raw.comercio === 'string' ? raw.comercio : null,
      sucursal: typeof raw.sucursal === 'string' ? raw.sucursal : null,
      numero_ticket:
        raw.numero_ticket != null ? String(raw.numero_ticket) : null,
      items_detectados: Number.isFinite(Number(raw.items_detectados))
        ? Math.max(0, Math.trunc(Number(raw.items_detectados)))
        : 0,
      legible: raw.legible === true,
      confianza: ['alta', 'media', 'baja'].includes(raw.confianza)
        ? raw.confianza
        : 'baja',
      observaciones:
        typeof raw.observaciones === 'string' ? raw.observaciones : null,
    }
  } catch {
    return fallback
  }
}
