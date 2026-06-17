import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reporte semanal de tareas (F6-T · T12) — lunes 07:00 (en Hobby corre daily,
 * documentado). Narrativa con cumplimiento por sucursal + top/bottom empleados
 * → ai_resumenes_diarios + notificación a super_admin.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run()
}

async function run() {
  const adm = createAdminClient()
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const [{ data: sucM }, { data: empM }, { data: sucs }] = await Promise.all([
    adm.from('sucursales_metricas_diarias').select('sucursal_id, total, completadas, cumplimiento_pct').gte('fecha', desde),
    adm.from('empleados_metricas_diarias').select('empleado_user_id, completadas, asignadas, puntos_dia').gte('fecha', desde),
    adm.from('sucursales').select('id, nombre'),
  ])

  const sucName = Object.fromEntries((sucs ?? []).map((s: any) => [s.id, s.nombre]))

  // Agregado por sucursal
  const porSuc = new Map<string, { total: number; completadas: number }>()
  for (const r of (sucM ?? []) as any[]) {
    const a = porSuc.get(r.sucursal_id) ?? { total: 0, completadas: 0 }
    a.total += r.total ?? 0; a.completadas += r.completadas ?? 0
    porSuc.set(r.sucursal_id, a)
  }
  const sucursales = [...porSuc.entries()].map(([id, a]) => ({
    nombre: sucName[id] ?? id.slice(0, 8),
    cumplimiento: a.total > 0 ? Math.round((a.completadas / a.total) * 100) : 0,
    total: a.total,
  })).sort((x, y) => y.cumplimiento - x.cumplimiento)

  // Agregado por empleado (puntos de la semana)
  const porEmp = new Map<string, number>()
  for (const r of (empM ?? []) as any[]) porEmp.set(r.empleado_user_id, (porEmp.get(r.empleado_user_id) ?? 0) + (r.puntos_dia ?? 0))
  const ranking = [...porEmp.entries()].sort((a, b) => b[1] - a[1])

  const datos = { sucursales, semana_desde: desde, empleados_activos: ranking.length }

  let narrativa = '## Reporte semanal de tareas\n\n'
  if (sucursales.length === 0) {
    narrativa += 'No hay métricas de tareas en la última semana todavía.'
  } else if (hasAnthropicKey()) {
    try {
      const a = getAnthropic()
      const msg = await a.messages.create({
        model: CHAT_MODEL, max_tokens: 600,
        system: 'Sos NORA. Escribí un reporte semanal ejecutivo de tareas para el dueño de NORA HQ (farmacias Social Ahorro). Markdown, conciso, voseo, sin emojis. Destacá la sucursal con mejor y peor cumplimiento y una recomendación concreta.',
        messages: [{ role: 'user', content: `Cumplimiento por sucursal (última semana): ${sucursales.map((s) => `${s.nombre}: ${s.cumplimiento}% (${s.total} tareas)`).join(' · ')}` }],
      })
      narrativa = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    } catch { /* fallback abajo */ }
  }
  if (narrativa.length < 40) {
    narrativa = `## Reporte semanal\n\n${sucursales.map((s) => `- **${s.nombre}**: ${s.cumplimiento}% de cumplimiento (${s.total} tareas)`).join('\n')}`
  }

  const hoy = new Date().toISOString().slice(0, 10)
  await adm.from('ai_resumenes_diarios').insert({ fecha: hoy, resumen_markdown: narrativa, metricas: datos })

  const { data: supers } = await adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true)
  if (supers?.length) {
    await adm.from('notificaciones_admin').insert(
      supers.map((s: any) => ({ user_id: s.id, tipo: 'info', prioridad: 'media', titulo: 'Reporte semanal de tareas', mensaje: 'NORA generó el resumen de la semana.', url_accion: '/hub/ia/resumen' })),
    )
  }

  return NextResponse.json({ ok: true, sucursales: sucursales.length })
}
