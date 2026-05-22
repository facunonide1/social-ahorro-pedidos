import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL, CHAT_MAX_TOKENS } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Parseo de tarea por lenguaje natural (F6.5.6 Diferencial 6).
 *
 * Body: { texto: string }
 * Devuelve un draft estructurado para precargar el form de nueva tarea.
 * NO crea la tarea — eso queda al user para revisar/confirmar.
 */
export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada' },
      { status: 500 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }
  const texto: string = String(body?.texto ?? '').trim()
  if (!texto) {
    return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
  }

  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  }

  // Catálogos para que el modelo elija IDs reales
  const [tiposRes, sucRes, empRes] = await Promise.all([
    sb
      .from('tipos_tareas')
      .select('id, codigo, nombre, categoria, prioridad_default, sla_horas')
      .eq('activo', true)
      .limit(50),
    sb
      .from('sucursales')
      .select('id, nombre, codigo')
      .eq('activa', true)
      .limit(30),
    sb
      .from('empleados')
      .select('id, user_id, nombre_completo, sucursal_id')
      .eq('activo', true)
      .limit(200),
  ])

  const tipos = (tiposRes.data ?? []) as any[]
  const sucursales = (sucRes.data ?? []) as any[]
  const empleados = ((empRes.data ?? []) as any[]).filter((e) => e.user_id)

  const SYSTEM = `Sos NORA. Convertís una descripción en lenguaje natural en
un draft estructurado de tarea para NORA HQ.

Devolvé SIEMPRE y SOLO JSON válido (sin markdown) con esta forma:
{
  "tipo_tarea_id": "uuid existente o null si no encontrás match",
  "titulo": "título conciso",
  "descripcion": "1-2 frases",
  "responsable_user_id": "user_id existente o null",
  "sucursal_id": "uuid existente o null",
  "prioridad": "baja" | "media" | "alta" | "critica",
  "fecha_vencimiento_iso": "YYYY-MM-DDTHH:mm:ss-03:00 o null",
  "recurrencia": { "patron": "diario"|"semanal"|"mensual", "dias_semana": [int]|null, "dia_mes": int|null, "hora": "HH:mm"|null } | null,
  "confianza": "alta" | "media" | "baja",
  "notas_parseo": "una frase explicando qué dedujiste"
}

Reglas:
- Elegí IDs SOLO de los catálogos que te paso. Si no hay match, devolvé null.
- Fechas relativas ("mañana", "el lunes"): resolvelas a ISO -03:00 desde HOY.
- "Todos los lunes a las 11" → recurrencia semanal, dias_semana=[1], hora="11:00".
- "Cada lunes" sin hora → recurrencia con hora null.
- Si no detectás recurrencia, devolvé recurrencia: null.
- Si el texto es ambiguo, devolvé confianza "baja" y explicá en notas_parseo.`

  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  const userMsg = `HOY: ${ahora} (zona AR, UTC-3).

CATÁLOGO TIPOS (id · codigo · nombre · categoria · prioridad_default · sla_horas):
${tipos.map((t) => `${t.id} · ${t.codigo} · ${t.nombre} · ${t.categoria} · ${t.prioridad_default} · ${t.sla_horas ?? 'sin sla'}`).join('\n')}

SUCURSALES (id · codigo · nombre):
${sucursales.map((s) => `${s.id} · ${s.codigo ?? '—'} · ${s.nombre}`).join('\n')}

EMPLEADOS (user_id · nombre · sucursal_id):
${empleados
  .slice(0, 100)
  .map((e) => `${e.user_id} · ${e.nombre_completo} · ${e.sucursal_id ?? '—'}`)
  .join('\n')}

DESCRIPCIÓN DEL USUARIO:
${texto}

Devolvé solo el JSON.`

  const anthropic = getAnthropic()
  let raw: string
  try {
    const msg = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    raw = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('')
      .trim()
  } catch (e: any) {
    return NextResponse.json(
      { error: `claude fallo: ${e?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }

  const parsed = extractJson(raw)
  if (!parsed) {
    return NextResponse.json(
      {
        error: 'no pudimos interpretar la respuesta del modelo',
        crudo: raw.slice(0, 400),
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, draft: parsed })
}

function extractJson(text: string): any | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}
