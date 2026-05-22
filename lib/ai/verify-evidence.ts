import { getAnthropic } from '@/lib/ai/client'
import { OCR_MODEL, OCR_MAX_TOKENS } from '@/lib/ai/config'

export type EvidenciaVerificada = {
  aprobado: boolean
  razon: string
  sugerencias: string
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type EvidenciaMediaType = (typeof MEDIA_TYPES)[number]

export function isSupportedEvidenceMediaType(t: string): t is EvidenciaMediaType {
  return (MEDIA_TYPES as readonly string[]).includes(t)
}

const SYSTEM_PROMPT = `Sos una verificadora visual de evidencias en NORA HQ.
Te paso una foto y un criterio de evaluación.

Devolvé SIEMPRE y SOLO JSON válido (sin markdown, sin \`\`\`) con esta forma:
{
  "aprobado": true | false,
  "razon": "explicación corta (máx 25 palabras)",
  "sugerencias": "si rechazás, qué tendrían que mejorar; si aprobás, '' o nota breve"
}

Reglas:
- Si la imagen no es clara o no muestra lo pedido, rechazá con razón.
- Sé concisa: nada de "claro!", "por supuesto", "espero haber ayudado".
- Tono profesional cercano argentino.`

/**
 * Manda la foto + el criterio del tipo de tarea a Claude vision y parsea
 * el veredicto. Si el modelo no devuelve JSON válido, marca como rechazado
 * con razón fallback (no aprueba por defecto).
 */
export async function verificarEvidencia(
  base64: string,
  mediaType: EvidenciaMediaType,
  promptTipo: string,
): Promise<EvidenciaVerificada> {
  const anthropic = getAnthropic()
  const msg = await anthropic.messages.create({
    model: OCR_MODEL,
    max_tokens: OCR_MAX_TOKENS,
    system: SYSTEM_PROMPT,
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
            text: `Criterio del tipo de tarea:\n${promptTipo}\n\nEvaluá la foto y devolvé el JSON.`,
          },
        ],
      },
    ],
  })

  const text = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text as string)
    .join('')
    .trim()

  return parseVerdict(text)
}

function parseVerdict(text: string): EvidenciaVerificada {
  const fallback: EvidenciaVerificada = {
    aprobado: false,
    razon: 'No se pudo interpretar la verificación visual.',
    sugerencias: 'Volvé a subir la foto con mejor iluminación.',
  }
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return fallback
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1))
    return {
      aprobado: raw.aprobado === true,
      razon: typeof raw.razon === 'string' ? raw.razon : fallback.razon,
      sugerencias:
        typeof raw.sugerencias === 'string' ? raw.sugerencias : '',
    }
  } catch {
    return fallback
  }
}
