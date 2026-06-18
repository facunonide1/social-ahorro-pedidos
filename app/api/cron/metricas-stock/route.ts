import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Recalcula producto_rotacion desde movimientos `venta` (OPS · T6).
 * GET: cron (cron-secret). POST: super_admin manual.
 *  - venta_diaria_prom 7d/30d, dias_stock_restante, fecha_quiebre_estimada,
 *  - ultima_venta, clasificacion_abc (por facturación: A=top 20% items, B=30%, C=resto).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run()
}
export async function POST() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
  }
  return run()
}

async function run() {
  const adm = createAdminClient()
  const ahora = Date.now()
  const d30 = new Date(ahora - 30 * 86_400_000).toISOString()
  const d7 = new Date(ahora - 7 * 86_400_000).toISOString()
  const hoy = new Date().toISOString().slice(0, 10)

  const [{ data: ventas }, { data: stock }, { data: prods }] = await Promise.all([
    adm.from('movimientos_stock').select('producto_id, sucursal_id, cantidad, fecha').eq('tipo', 'venta').gte('fecha', d30),
    adm.from('stock_items').select('producto_id, sucursal_id, cantidad'),
    adm.from('productos_catalogo').select('id, precio_sugerido, precio_costo_promedio').eq('activo', true),
  ])

  const precio = new Map<string, number>(((prods ?? []) as any[]).map((p) => [p.id, Number(p.precio_sugerido ?? p.precio_costo_promedio ?? 0)]))

  type Agg = { u7: number; u30: number; ultima: string | null }
  const ventaAgg = new Map<string, Agg>()
  const key = (p: string, s: string) => `${p}|${s}`
  for (const v of (ventas ?? []) as any[]) {
    const u = Math.abs(Number(v.cantidad))
    const k = key(v.producto_id, v.sucursal_id)
    const a = ventaAgg.get(k) ?? { u7: 0, u30: 0, ultima: null }
    a.u30 += u
    if (v.fecha >= d7) a.u7 += u
    if (!a.ultima || v.fecha > a.ultima) a.ultima = v.fecha
    ventaAgg.set(k, a)
  }

  const stockMap = new Map<string, number>(((stock ?? []) as any[]).map((s) => [key(s.producto_id, s.sucursal_id), Number(s.cantidad)]))

  // Facturación 30d por producto (consolidado) para ABC por item.
  const factPorProd = new Map<string, number>()
  for (const [k, a] of ventaAgg) {
    const [p] = k.split('|')
    factPorProd.set(p, (factPorProd.get(p) ?? 0) + a.u30 * (precio.get(p) ?? 0))
  }
  const ranking = [...factPorProd.entries()].filter(([, f]) => f > 0).sort((a, b) => b[1] - a[1])
  const abc = new Map<string, string>()
  ranking.forEach(([p], i) => {
    const pct = (i + 1) / ranking.length
    abc.set(p, pct <= 0.2 ? 'A' : pct <= 0.5 ? 'B' : 'C')
  })

  // Filas: unión de claves con stock o ventas
  const claves = new Set<string>([...stockMap.keys(), ...ventaAgg.keys()])
  const rows = [...claves].map((k) => {
    const [producto_id, sucursal_id] = k.split('|')
    const a = ventaAgg.get(k) ?? { u7: 0, u30: 0, ultima: null }
    const v7 = Math.round((a.u7 / 7) * 100) / 100
    const v30 = Math.round((a.u30 / 30) * 100) / 100
    const cant = stockMap.get(k) ?? 0
    const dias = v30 > 0 ? Math.round((cant / v30) * 10) / 10 : null
    const quiebre = dias != null ? new Date(ahora + dias * 86_400_000).toISOString().slice(0, 10) : null
    return {
      producto_id, sucursal_id,
      venta_diaria_prom_7d: v7, venta_diaria_prom_30d: v30,
      dias_stock_restante: dias, fecha_quiebre_estimada: quiebre,
      clasificacion_abc: abc.get(producto_id) ?? null,
      ultima_venta: a.ultima ? a.ultima.slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }
  })

  if (rows.length > 0) {
    await adm.from('producto_rotacion').upsert(rows, { onConflict: 'producto_id,sucursal_id' })
  }
  return NextResponse.json({ ok: true, fecha: hoy, filas: rows.length })
}
