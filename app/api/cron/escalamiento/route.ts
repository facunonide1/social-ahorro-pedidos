import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Escalamiento de tareas vencidas y verificaciones estancadas (F6-T · T8).
 *
 * Ideal: cada 30 min. En plan Hobby corre daily (documentado). Idempotente:
 * usa escalamiento_nivel para no re-notificar el mismo nivel.
 *
 * Niveles por minutos de atraso: 1 (<60) responsable · 2 (60-119) supervisor ·
 * 3 (120+) super_admin + flag Mission Control.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run()
}

async function run() {
  const adm = createAdminClient()
  const now = Date.now()
  const nowIso = new Date().toISOString()

  // Supervisores por sucursal + super_admins
  const [{ data: sups }, { data: supers }] = await Promise.all([
    adm.from('supervisores_tareas').select('sucursal_id, user_id').eq('activo', true),
    adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true),
  ])
  const supBySuc = new Map<string, string[]>()
  for (const s of (sups ?? []) as any[]) {
    const arr = supBySuc.get(s.sucursal_id) ?? []
    arr.push(s.user_id); supBySuc.set(s.sucursal_id, arr)
  }
  const superIds = (supers ?? []).map((s: any) => s.id)

  const notifs: any[] = []
  const updates: { id: string; patch: Record<string, unknown> }[] = []

  // ---- Tareas vencidas / por escalar ----
  const { data: vencidas } = await adm
    .from('tareas')
    .select('id, codigo, titulo, sucursal_id, responsable_id, asignacion_tipo, fecha_vencimiento, estado, escalamiento_nivel')
    .lt('fecha_vencimiento', nowIso)
    .in('estado', ['pendiente', 'reclamada', 'asignada', 'en_progreso', 'vencida'])
    .limit(500)

  for (const t of (vencidas ?? []) as any[]) {
    const overdueMin = Math.round((now - new Date(t.fecha_vencimiento).getTime()) / 60000)
    const nivel = overdueMin < 60 ? 1 : overdueMin < 120 ? 2 : 3
    const patch: Record<string, unknown> = {}
    if (t.estado !== 'vencida') patch.estado = 'vencida'

    if (nivel > (t.escalamiento_nivel ?? 0)) {
      patch.escalamiento_nivel = nivel
      const url = `/admin/tareas/${t.id}`
      if (nivel === 1) {
        if (t.responsable_id) notifs.push(n(t.responsable_id, 'tarea', 'alta', 'Tarea vencida', `${t.titulo} venció. Resolvela cuanto antes.`, url))
        else for (const sid of supBySuc.get(t.sucursal_id) ?? []) notifs.push(n(sid, 'tarea', 'alta', 'Tarea de pool sin tomar y vencida', t.titulo, url))
      } else if (nivel === 2) {
        for (const sid of supBySuc.get(t.sucursal_id) ?? []) notifs.push(n(sid, 'alerta', 'alta', 'Tarea vencida hace 1h+', `${t.titulo} (responsable: ${t.responsable_id ? 'asignado' : 'pool'})`, url))
      } else {
        for (const sid of superIds) notifs.push(n(sid, 'alerta', 'critica', 'Escalamiento: tarea vencida 2h+', `${t.titulo} en sucursal sin resolver`, url))
      }
    }
    if (Object.keys(patch).length) updates.push({ id: t.id, patch })
  }

  // ---- Verificaciones estancadas ----
  const { data: enVerif } = await adm
    .from('tareas')
    .select('id, titulo, sucursal_id, fecha_completada, escalamiento_nivel')
    .eq('estado', 'en_verificacion')
    .not('fecha_completada', 'is', null)
    .limit(300)

  for (const t of (enVerif ?? []) as any[]) {
    const horas = (now - new Date(t.fecha_completada).getTime()) / 3_600_000
    const url = `/admin/verificaciones`
    if (horas >= 8 && (t.escalamiento_nivel ?? 0) < 3) {
      for (const sid of superIds) notifs.push(n(sid, 'alerta', 'alta', 'Verificación demorada 8h+', t.titulo, url))
      updates.push({ id: t.id, patch: { escalamiento_nivel: 3 } })
    } else if (horas >= 4 && (t.escalamiento_nivel ?? 0) < 2) {
      for (const sid of supBySuc.get(t.sucursal_id) ?? []) notifs.push(n(sid, 'tarea', 'media', 'Verificación pendiente 4h+', t.titulo, url))
      updates.push({ id: t.id, patch: { escalamiento_nivel: 2 } })
    }
  }

  for (const u of updates) await adm.from('tareas').update(u.patch).eq('id', u.id)
  if (notifs.length) await adm.from('notificaciones_admin').insert(notifs)

  return NextResponse.json({ ok: true, tareas_evaluadas: (vencidas ?? []).length, notificaciones: notifs.length })
}

function n(user_id: string, tipo: string, prioridad: string, titulo: string, mensaje: string, url_accion: string) {
  return { user_id, tipo, prioridad, titulo, mensaje, url_accion }
}
