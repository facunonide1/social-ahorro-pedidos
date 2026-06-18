import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gateSuper() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || me.rol !== 'super_admin') return { error: 'requiere super_admin', status: 403 as const }
  return { ok: true as const }
}

/** POST { accion: 'cargar' | 'borrar' } — datos demo de tareas/métricas (F6-T · T14). */
export async function POST(req: NextRequest) {
  const g = await gateSuper()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { body = {} }
  const adm = createAdminClient()

  if (body?.accion === 'borrar') {
    await adm.from('tareas').delete().eq('es_demo', true)
    await adm.from('tareas_recurrencias').delete().eq('es_demo', true)
    await adm.from('sucursales_metricas_diarias').delete().eq('es_demo', true)
    await adm.from('empleados_metricas_diarias').delete().eq('es_demo', true)
    // OPS/WMS demo: borrar alertas + productos DEMO- (cascada a stock/lotes/rotacion/movimientos)
    await adm.from('alertas_stock').delete().eq('es_demo', true)
    await adm.from('productos_catalogo').delete().like('sku', 'DEMO-%')
    return NextResponse.json({ ok: true, accion: 'borrar' })
  }

  // ---- CARGAR ----
  const [{ data: sucs }, { data: tipos }, { data: turnos }] = await Promise.all([
    adm.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre').limit(4),
    adm.from('tipos_tareas').select('id, nombre, verificacion_humana, prioridad_default').eq('activo', true).limit(16),
    adm.from('turnos_sucursal').select('id, sucursal_id').eq('activo', true),
  ])
  const sucursales = (sucs ?? []) as any[]
  const tipoList = (tipos ?? []) as any[]
  const turnosBySuc = new Map<string, string[]>()
  for (const t of (turnos ?? []) as any[]) {
    const a = turnosBySuc.get(t.sucursal_id) ?? []; a.push(t.id); turnosBySuc.set(t.sucursal_id, a)
  }
  if (sucursales.length === 0 || tipoList.length === 0) {
    return NextResponse.json({ error: 'faltan sucursales o tipos para el demo' }, { status: 400 })
  }

  // 30 días de métricas por sucursal (SA-04 la peor para que se note el contraste)
  const baseCumpl = [92, 88, 85, 78]
  const metRows: any[] = []
  for (let i = 0; i < sucursales.length; i++) {
    const base = baseCumpl[i] ?? 85
    for (let d = 1; d <= 30; d++) {
      const fecha = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
      const noise = ((d * 7 + i * 13) % 11) - 5
      const cumpl = Math.max(60, Math.min(100, base + noise))
      const total = 12 + ((d + i) % 9)
      const completadas = Math.round((total * cumpl) / 100)
      metRows.push({
        sucursal_id: sucursales[i].id, fecha, total, completadas,
        en_sla: Math.round(completadas * 0.9), vencidas: total - completadas,
        cumplimiento_pct: cumpl, es_demo: true,
      })
    }
  }
  await adm.from('sucursales_metricas_diarias').upsert(metRows, { onConflict: 'sucursal_id,fecha' })

  // Tareas de HOY: pool sin reclamar + en verificación + vencidas
  const fechaAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const tareas: any[] = []
  const pick = (n: number) => tipoList[n % tipoList.length]
  let k = 0
  for (const s of sucursales) {
    const turnoIds = turnosBySuc.get(s.id) ?? [null]
    // 2 pool por sucursal
    for (let j = 0; j < 2; j++) {
      const tp = pick(k++)
      tareas.push({
        tipo_tarea_id: tp.id, tipo_origen: 'auto_recurrencia', titulo: `${tp.nombre} — ${s.nombre}`,
        prioridad: tp.prioridad_default ?? 'media', estado: 'pendiente',
        asignacion_tipo: 'pool_turno', turno_id: turnoIds[j % turnoIds.length], sucursal_id: s.id,
        verificacion_humana: tp.verificacion_humana ?? true,
        fecha_vencimiento: `${fechaAR}T20:00:00-03:00`, hora_limite: '20:00:00',
        creado_por_nombre: 'NORA · demo', es_demo: true,
      })
    }
    // 1 en verificación con pre-IA
    const tv = pick(k++)
    tareas.push({
      tipo_tarea_id: tv.id, tipo_origen: 'auto_recurrencia', titulo: `${tv.nombre} — ${s.nombre}`,
      prioridad: 'media', estado: 'en_verificacion', asignacion_tipo: 'pool_sucursal', sucursal_id: s.id,
      verificacion_humana: true, fecha_completada: new Date(Date.now() - 30 * 60000).toISOString(),
      evidencias: [{ tipo: 'nota', valor: 'Tarea de demostración completada', timestamp: new Date().toISOString(), user_id: '' }],
      pre_verificacion_ia: { resultado: j2(k), motivo: 'Verificación de demostración', analizado_at: new Date().toISOString() },
      creado_por_nombre: 'NORA · demo', es_demo: true,
    })
  }
  // 2 vencidas escaladas
  for (let j = 0; j < 2; j++) {
    const s = sucursales[j % sucursales.length]; const tp = pick(k++)
    tareas.push({
      tipo_tarea_id: tp.id, tipo_origen: 'auto_recurrencia', titulo: `${tp.nombre} — ${s.nombre} (vencida)`,
      prioridad: 'alta', estado: 'vencida', asignacion_tipo: 'pool_turno', turno_id: (turnosBySuc.get(s.id) ?? [null])[0],
      sucursal_id: s.id, verificacion_humana: true, escalamiento_nivel: 3,
      fecha_vencimiento: new Date(Date.now() - 3 * 3_600_000).toISOString(), creado_por_nombre: 'NORA · demo', es_demo: true,
    })
  }
  const { data: ins } = await adm.from('tareas').insert(tareas).select('id')

  return NextResponse.json({ ok: true, accion: 'cargar', metricas: metRows.length, tareas: ins?.length ?? 0 })
}

function j2(k: number): string {
  const r = k % 3
  return r === 0 ? 'aprobada' : r === 1 ? 'dudosa' : 'aprobada'
}
