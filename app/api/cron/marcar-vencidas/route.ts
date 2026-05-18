import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron cada 30 min — marca tareas vencidas.
 *
 * Una tarea pasa a 'vencida' si:
 *   - fecha_vencimiento < now()
 *   - estado en (pendiente, asignada, en_progreso, bloqueada)
 *
 * Las que están en verificación/aprobación ya están "trabajadas" — no
 * las marcamos como vencidas para no penalizar al responsable.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req))
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })

  const sb = createAdminClient()
  const now = new Date().toISOString()

  const { data: vencidas, error } = await sb
    .from('tareas')
    .select('id, codigo, responsable_id, titulo')
    .lt('fecha_vencimiento', now)
    .in('estado', ['pendiente', 'asignada', 'en_progreso', 'bloqueada'])
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!vencidas || vencidas.length === 0)
    return NextResponse.json({ ok: true, marcadas: 0 })

  const ids = vencidas.map((t: any) => t.id)
  const { error: updErr } = await sb
    .from('tareas')
    .update({ estado: 'vencida' })
    .in('id', ids)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Historial + notificaciones
  await sb.from('tareas_historial').insert(
    vencidas.map((t: any) => ({
      tarea_id: t.id,
      accion: 'vencida' as const,
      estado_nuevo: { estado: 'vencida' },
    })),
  )

  await sb.from('notificaciones_admin').insert(
    vencidas
      .filter((t: any) => t.responsable_id)
      .map((t: any) => ({
        user_id: t.responsable_id,
        tipo: 'alerta' as const,
        titulo: 'Tarea vencida',
        mensaje: `${t.codigo} · ${t.titulo}`,
        prioridad: 'alta' as const,
        url_accion: `/admin/tareas/${t.id}`,
      })),
  )

  return NextResponse.json({ ok: true, marcadas: vencidas.length })
}
