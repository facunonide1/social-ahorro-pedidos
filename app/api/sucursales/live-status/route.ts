import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SucursalLive = {
  sucursal_id: string
  nombre: string
  codigo: string | null
  health: 'verde' | 'amarillo' | 'rojo'
  facturado_dia: number
  empleados_activos: number
  tickets_dia: number
  tareas_total?: number
  tareas_completadas?: number
  tareas_pct?: number | null
  alerta: string | null
}

/**
 * Estado en vivo de las sucursales para el Mission Control (F6.5.T4).
 *
 * Tolerante a tablas vacías: si no hay datos devuelve 0 (nunca error).
 * Nota: `orders` no tiene `sucursal_id` (usa zona), así que facturado/tickets
 * por sucursal quedan en 0 hasta que exista el vínculo; empleados sí se cuentan.
 */
export async function GET(_req: NextRequest) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  }

  const adm = createAdminClient()

  try {
    const { data: sucursales } = await adm
      .from('sucursales')
      .select('id, nombre, codigo')
      .eq('activa', true)
      .order('nombre')

    const sucs = (sucursales ?? []) as {
      id: string
      nombre: string
      codigo: string | null
    }[]

    // Empleados activos por sucursal (una sola query agregada en memoria).
    const { data: empleados } = await adm
      .from('empleados')
      .select('sucursal_id')
      .eq('activo', true)

    const empPorSuc = new Map<string, number>()
    for (const e of (empleados ?? []) as { sucursal_id: string | null }[]) {
      if (!e.sucursal_id) continue
      empPorSuc.set(e.sucursal_id, (empPorSuc.get(e.sucursal_id) ?? 0) + 1)
    }

    // Tareas de hoy por sucursal (cumplimiento + escalamientos nivel 3)
    const fechaAR = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date())
    const ini = `${fechaAR}T00:00:00-03:00`
    const fin = `${fechaAR}T23:59:59-03:00`
    const { data: tareasHoy } = await adm
      .from('tareas')
      .select('sucursal_id, estado, escalamiento_nivel')
      .gte('fecha_vencimiento', ini)
      .lte('fecha_vencimiento', fin)
      .limit(5000)

    const tareasPorSuc = new Map<string, { total: number; completadas: number; escaladas: number }>()
    for (const t of (tareasHoy ?? []) as { sucursal_id: string | null; estado: string; escalamiento_nivel: number | null }[]) {
      if (!t.sucursal_id) continue
      const a = tareasPorSuc.get(t.sucursal_id) ?? { total: 0, completadas: 0, escaladas: 0 }
      a.total++
      if (t.estado === 'completada') a.completadas++
      if ((t.escalamiento_nivel ?? 0) >= 3) a.escaladas++
      tareasPorSuc.set(t.sucursal_id, a)
    }

    const result: SucursalLive[] = sucs.map((s) => {
      const tx = tareasPorSuc.get(s.id) ?? { total: 0, completadas: 0, escaladas: 0 }
      const pct = tx.total > 0 ? Math.round((tx.completadas / tx.total) * 100) : null
      const health: SucursalLive['health'] =
        tx.escaladas > 0 ? 'rojo' : pct != null && pct < 70 ? 'amarillo' : 'verde'
      return {
        sucursal_id: s.id,
        nombre: s.nombre,
        codigo: s.codigo,
        health,
        facturado_dia: 0,
        empleados_activos: empPorSuc.get(s.id) ?? 0,
        tickets_dia: 0,
        tareas_total: tx.total,
        tareas_completadas: tx.completadas,
        tareas_pct: pct,
        alerta: tx.escaladas > 0 ? `${tx.escaladas} tarea${tx.escaladas === 1 ? '' : 's'} escalada${tx.escaladas === 1 ? '' : 's'}` : null,
      }
    })

    return NextResponse.json({ ok: true, sucursales: result })
  } catch {
    return NextResponse.json({ ok: true, sucursales: [] })
  }
}
