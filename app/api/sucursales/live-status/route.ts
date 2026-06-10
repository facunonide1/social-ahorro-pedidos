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

    const result: SucursalLive[] = sucs.map((s) => ({
      sucursal_id: s.id,
      nombre: s.nombre,
      codigo: s.codigo,
      health: 'verde',
      facturado_dia: 0,
      empleados_activos: empPorSuc.get(s.id) ?? 0,
      tickets_dia: 0,
      alerta: null,
    }))

    return NextResponse.json({ ok: true, sucursales: result })
  } catch {
    return NextResponse.json({ ok: true, sucursales: [] })
  }
}
