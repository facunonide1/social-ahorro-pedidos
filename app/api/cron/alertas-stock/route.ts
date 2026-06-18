import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LEAD_DAYS = 3 // lead time de reposición (config futura)

/**
 * Genera alertas_stock (OPS · T8): 9 tipos. Regenera las activas no-demo cada
 * corrida (preserva atendidas/descartadas e históricas demo). GET cron / POST super.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run()
}
export async function POST() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
  return run()
}

async function run() {
  const adm = createAdminClient()
  const ahora = Date.now()
  const en = (d: number) => new Date(ahora + d * 86_400_000).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  const [{ data: stock }, { data: rot }, { data: lotes }, { data: prods }, { data: sucs }] = await Promise.all([
    adm.from('stock_items').select('producto_id, sucursal_id, cantidad, stock_minimo, stock_maximo'),
    adm.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante, ultima_venta'),
    adm.from('lotes_productos').select('id, producto_id, sucursal_id, numero_lote, fecha_vencimiento, cantidad_actual').gt('cantidad_actual', 0),
    adm.from('productos_catalogo').select('id, nombre, sku').eq('activo', true),
    adm.from('sucursales').select('id, nombre').eq('activa', true),
  ])
  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const rotMap = new Map(((rot ?? []) as any[]).map((r) => [`${r.producto_id}|${r.sucursal_id}`, r]))
  const nombre = (id: string) => prodMap.get(id)?.nombre ?? '—'
  const sku = (id: string) => prodMap.get(id)?.sku ?? null

  type Alerta = { tipo: string; producto_id: string | null; sucursal_id: string | null; lote_id?: string | null; severidad: string; datos: any }
  const out: Alerta[] = []

  // Stock / rotación
  for (const s of (stock ?? []) as any[]) {
    const cant = Number(s.cantidad), min = Number(s.stock_minimo), max = s.stock_maximo == null ? null : Number(s.stock_maximo)
    const r = rotMap.get(`${s.producto_id}|${s.sucursal_id}`)
    const venta30 = Number(r?.venta_diaria_prom_30d ?? 0)
    const dias = r?.dias_stock_restante == null ? null : Number(r.dias_stock_restante)
    const base = { producto_id: s.producto_id, sucursal_id: s.sucursal_id, datos: { nombre: nombre(s.producto_id), sku: sku(s.producto_id), sucursal: sucMap.get(s.sucursal_id), stock: cant, min } }

    if (min > 0 && cant <= min) out.push({ ...base, tipo: 'stock_critico', severidad: cant <= 0 ? 'critica' : 'warning' })
    if (dias != null && venta30 > 0 && dias <= LEAD_DAYS) out.push({ ...base, tipo: 'quiebre_proyectado', severidad: 'critica', datos: { ...base.datos, dias } })
    if (max != null && cant > max) out.push({ ...base, tipo: 'sobrestock', severidad: 'info', datos: { ...base.datos, max } })

    if (cant > 0 && venta30 === 0) {
      const ult = r?.ultima_venta ? new Date(r.ultima_venta).getTime() : null
      const diasSinVender = ult ? (ahora - ult) / 86_400_000 : null
      if (ult && diasSinVender != null && diasSinVender > 30 && diasSinVender < 120) {
        out.push({ ...base, tipo: 'stock_fantasma', severidad: 'critica', datos: { ...base.datos, ultima_venta: r.ultima_venta } })
      } else {
        out.push({ ...base, tipo: 'sin_rotacion', severidad: 'warning' })
      }
    }
  }

  // Vencimientos por lote
  const v15 = en(15), v30 = en(30), v60 = en(60), v90 = en(90)
  for (const l of (lotes ?? []) as any[]) {
    const f = l.fecha_vencimiento
    if (!f || f > v90) continue
    const tipo = f <= v15 ? 'vencimiento_15' : f <= v30 ? 'vencimiento_30' : f <= v60 ? 'vencimiento_60' : 'vencimiento_90'
    const sev = f <= v15 ? 'critica' : f <= v30 ? 'warning' : 'info'
    out.push({ tipo, producto_id: l.producto_id, sucursal_id: l.sucursal_id, lote_id: l.id, severidad: sev,
      datos: { nombre: nombre(l.producto_id), sku: sku(l.producto_id), sucursal: sucMap.get(l.sucursal_id), lote: l.numero_lote, vence: f, cantidad: Number(l.cantidad_actual) } })
  }

  // Regenerar activas no-demo
  await adm.from('alertas_stock').delete().eq('estado', 'activa').eq('es_demo', false)
  if (out.length > 0) {
    await adm.from('alertas_stock').insert(out.map((a) => ({ ...a, estado: 'activa' })))
  }

  // Notificar stock fantasma a super_admins
  const fantasmas = out.filter((a) => a.tipo === 'stock_fantasma')
  if (fantasmas.length > 0) {
    const { data: supers } = await adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true)
    if (supers?.length) {
      await adm.from('notificaciones_admin').insert(supers.flatMap((s: any) =>
        fantasmas.slice(0, 10).map((f) => ({ user_id: s.id, tipo: 'alerta', prioridad: 'critica', titulo: 'Posible stock fantasma', mensaje: `${f.datos.nombre} (${f.datos.sucursal}) dejó de vender con stock`, url_accion: '/hub/operaciones/alertas' }))))
    }
  }

  return NextResponse.json({ ok: true, fecha: hoy, alertas: out.length, fantasmas: fantasmas.length })
}
