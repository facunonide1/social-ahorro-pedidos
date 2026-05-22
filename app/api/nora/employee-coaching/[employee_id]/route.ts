import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Coach IA personal diario (F6.5.6 Diferencial 2).
 *
 * GET /api/nora/employee-coaching/[employee_id]
 * Devuelve { mensaje: string } para mostrar en NoraCoachingCard.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { employee_id: string } },
) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada' },
      { status: 500 },
    )
  }

  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  }

  const empleadoId = params.employee_id

  const { data: emp } = await sb
    .from('empleados')
    .select(
      'id, user_id, nombre_completo, sucursal_id, score_total, nivel_actual_id, sucursales(nombre)',
    )
    .eq('id', empleadoId)
    .maybeSingle()
  if (!emp) {
    return NextResponse.json({ error: 'empleado inexistente' }, { status: 404 })
  }

  const e = emp as any
  const sucursalNombre = pickOne<any>(e.sucursales)?.nombre ?? null
  const score = Number(e.score_total ?? 0)

  // Niveles: actual + siguiente
  const { data: niveles } = await sb
    .from('niveles_empleados')
    .select('id, nivel, nombre, titulo_profesional, puntos_necesarios')
    .order('puntos_necesarios', { ascending: true })
  const nivelActual = (niveles ?? []).find((n: any) => n.id === e.nivel_actual_id)
  const siguiente = (niveles ?? []).find(
    (n: any) => n.puntos_necesarios > score,
  )

  // Tareas hoy (vencen hoy o asignadas hoy, no completadas)
  const hoyIso = new Date().toISOString().slice(0, 10)
  const finIso = `${hoyIso}T23:59:59`
  const inicioIso = `${hoyIso}T00:00:00`
  let tareasHoy = 0
  let completadasHoy = 0
  if (e.user_id) {
    const [hoyRes, compRes] = await Promise.all([
      sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('responsable_id', e.user_id)
        .lte('fecha_vencimiento', finIso)
        .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion']),
      sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('responsable_id', e.user_id)
        .eq('estado', 'completada')
        .gte('fecha_completada', inicioIso),
    ])
    tareasHoy = hoyRes.count ?? 0
    completadasHoy = compRes.count ?? 0
  }

  // Ranking sucursal (mejor=1)
  let rankingPos = 0
  let rankingTotal = 0
  if (e.sucursal_id) {
    const { data: peers } = await sb
      .from('empleados')
      .select('id, score_total')
      .eq('sucursal_id', e.sucursal_id)
      .eq('activo', true)
    const list = (peers ?? []) as { id: string; score_total: number | null }[]
    list.sort(
      (a, b) => Number(b.score_total ?? 0) - Number(a.score_total ?? 0),
    )
    rankingTotal = list.length
    rankingPos = Math.max(1, list.findIndex((p) => p.id === empleadoId) + 1)
  }

  const faltan = siguiente
    ? Math.max(0, Number(siguiente.puntos_necesarios) - score)
    : 0

  const SYSTEM = `Sos NORA, coach personal del empleado.
Generá UN mensaje de coaching para hoy (3 frases máximo, sin emojis):
1) Saludo por nombre.
2) Lo más importante hoy (tarea urgente, riesgo u oportunidad).
3) Una sugerencia táctica concreta. Si está cerca de un badge o nivel, mencionalo.

Tono: profesional cercano argentino, primera persona plural ("tenemos", "vemos").
Sin chamuyo, sin "¡claro!", sin emojis. Devolvé SOLO el texto del mensaje, sin envoltorios.`

  const userMsg = `Datos del empleado:
- Nombre: ${e.nombre_completo}
- Sucursal: ${sucursalNombre ?? '—'}
- Score total: ${score} pts
- Nivel actual: ${nivelActual ? `${nivelActual.nivel} · ${nivelActual.nombre} (${nivelActual.titulo_profesional})` : 'sin nivel asignado'}
- Próximo nivel: ${siguiente ? `${siguiente.nombre} — faltan ${faltan} pts` : 'ya está en el máximo'}
- Tareas pendientes para hoy: ${tareasHoy}
- Completadas hoy: ${completadasHoy}
- Ranking sucursal: ${rankingTotal > 0 ? `#${rankingPos} de ${rankingTotal}` : '—'}

Escribí su coaching de hoy.`

  const anthropic = getAnthropic()
  try {
    const msg = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    const mensaje = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('')
      .trim()
    return NextResponse.json({
      ok: true,
      mensaje,
      datos: {
        score,
        tareas_hoy: tareasHoy,
        completadas_hoy: completadasHoy,
        ranking_pos: rankingPos,
        ranking_total: rankingTotal,
        faltan_para_siguiente: faltan,
        siguiente_nivel: siguiente?.nombre ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: `claude fallo: ${e?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}
