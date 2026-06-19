import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run(null)
}
export async function POST() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'administrativo'].includes(me.rol)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  return run(user.id)
}

/**
 * NORA propone ofertas como BORRADOR (módulo Ofertas · T6):
 * por vencer (liquidación), dormidos (sin rotación), combo imán+dormido.
 * Usa ofertas_aprendizaje para preferir el tipo que mejor rinde.
 */
async function run(userId: string | null) {
  const adm = createAdminClient()
  const en45 = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  // tipo preferido por aprendizaje (mayor uplift)
  const { data: aprend } = await adm.from('ofertas_aprendizaje').select('tipo_oferta, uplift_promedio').order('uplift_promedio', { ascending: false }).limit(1)
  const tipoPreferido = (aprend?.[0] as any)?.tipo_oferta ?? null

  // evitar duplicar: productos que ya tienen una propuesta NORA en borrador
  const { data: yaProp } = await adm.from('ofertas').select('productos_ids').eq('propuesta_por', 'nora').in('estado', ['borrador', 'pendiente_aprobacion'])
  const yaCubiertos = new Set<string>()
  for (const o of (yaProp ?? []) as any[]) for (const p of (o.productos_ids ?? [])) yaCubiertos.add(p)

  const [{ data: lotes }, { data: rot }, { data: prods }] = await Promise.all([
    adm.from('lotes_productos').select('producto_id, fecha_vencimiento, cantidad_actual').gt('cantidad_actual', 0).lte('fecha_vencimiento', en45).gte('fecha_vencimiento', hoy).order('fecha_vencimiento').limit(200),
    adm.from('producto_rotacion').select('producto_id, venta_diaria_prom_30d, clasificacion_abc').limit(20000),
    adm.from('productos_catalogo').select('id, nombre, sku, categoria, precio_sugerido, precio_costo_promedio').eq('activo', true).limit(20000),
  ])
  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const ventaMap = new Map(((rot ?? []) as any[]).map((r) => [r.producto_id, Number(r.venta_diaria_prom_30d ?? 0)]))

  const nuevas: any[] = []

  // 1) Por vencer → liquidación % descuento
  const lotesPorProd = new Map<string, { dias: number; u: number }>()
  for (const l of (lotes ?? []) as any[]) {
    if (yaCubiertos.has(l.producto_id)) continue
    const dias = Math.max(0, Math.round((new Date(l.fecha_vencimiento).getTime() - Date.now()) / 86_400_000))
    const e = lotesPorProd.get(l.producto_id) ?? { dias, u: 0 }
    e.u += Number(l.cantidad_actual); e.dias = Math.min(e.dias, dias)
    lotesPorProd.set(l.producto_id, e)
  }
  for (const [pid, info] of [...lotesPorProd].slice(0, 6)) {
    const p = prodMap.get(pid); if (!p) continue
    const pct = info.dias <= 15 ? 40 : info.dias <= 30 ? 30 : 20
    nuevas.push({ nombre: `Liquidación ${p.nombre}`, tipo: 'porcentaje_descuento', valor: pct, productos_ids: [pid], rubro: 'farmacia', canales: ['cartel', 'cuponera'], vigencia_tipo: 'hasta_agotar', origen: 'liquidacion_propia', propuesta_por: 'nora', estado: 'borrador', justificacion: `Vence en ${info.dias} días, ${info.u} u. en stock. Liquidar al ${pct}% recupera antes de perderlo.`, origen_ref: { motivo: 'por_vencer', dias: info.dias } })
    yaCubiertos.add(pid)
  }

  // 2) Dormidos → % descuento o tipo preferido
  const dormidos = ((prods ?? []) as any[]).filter((p) => !yaCubiertos.has(p.id) && (ventaMap.get(p.id) ?? 0) === 0).slice(0, 6)
  for (const p of dormidos) {
    const tipo = tipoPreferido && ['porcentaje_descuento', '2x1', 'segunda_unidad_pct'].includes(tipoPreferido) ? tipoPreferido : 'porcentaje_descuento'
    nuevas.push({ nombre: `Mover ${p.nombre}`, tipo, valor: tipo === 'porcentaje_descuento' ? 25 : tipo === 'segunda_unidad_pct' ? 50 : null, productos_ids: [p.id], rubro: 'farmacia', canales: ['cartel'], vigencia_tipo: 'con_fecha', fecha_inicio: hoy, fecha_fin: en45, origen: 'liquidacion_propia', propuesta_por: 'nora', estado: 'borrador', justificacion: `Sin rotación (0 ventas/día en 30d). ${tipo === 'porcentaje_descuento' ? '25% off' : 'promo'} para reactivarlo.`, origen_ref: { motivo: 'dormido' } })
    yaCubiertos.add(p.id)
  }

  // 3) Combo imán + dormido
  const imanes = ((prods ?? []) as any[]).filter((p) => (ventaMap.get(p.id) ?? 0) > 1).sort((a, b) => (ventaMap.get(b.id) ?? 0) - (ventaMap.get(a.id) ?? 0)).slice(0, 2)
  const dormido2 = ((prods ?? []) as any[]).filter((p) => !yaCubiertos.has(p.id) && (ventaMap.get(p.id) ?? 0) === 0)
  for (let i = 0; i < imanes.length && i < dormido2.length; i++) {
    const iman = imanes[i], dor = dormido2[i]
    const precio = Math.round((Number(iman.precio_sugerido ?? 0) + Number(dor.precio_sugerido ?? 0)) * 0.85)
    nuevas.push({ nombre: `Combo ${iman.nombre} + ${dor.nombre}`, tipo: 'combo', combo_detalle: { productos: [iman.id, dor.id], precio }, productos_ids: [iman.id, dor.id], rubro: 'farmacia', canales: ['cartel', 'cuponera'], vigencia_tipo: 'con_fecha', fecha_inicio: hoy, fecha_fin: en45, origen: 'liquidacion_propia', propuesta_por: 'nora', estado: 'borrador', justificacion: `Combo imán+dormido: ${iman.nombre} (vende bien) arrastra a ${dor.nombre} (estancado). Precio combo $${precio}.`, origen_ref: { motivo: 'combo_iman_dormido' } })
    yaCubiertos.add(dor.id)
  }

  let creadas = 0
  if (nuevas.length) {
    const { data, error } = await adm.from('ofertas').insert(nuevas.map((n) => ({ ...n, created_by: userId }))).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    creadas = data?.length ?? 0
  }
  return NextResponse.json({ ok: true, propuestas: creadas })
}
