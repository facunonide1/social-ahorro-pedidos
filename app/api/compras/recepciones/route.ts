import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'].includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

const TIPO_FACTURA: Record<string, string> = { factura_a: 'A', factura_b: 'B', factura_c: 'C' }

/**
 * Recibir mercadería contra una orden de compra (FIN/COMPRAS · T6).
 * Sube stock en la sucursal compradora, genera transferencias a las otras
 * sucursales según distribución, crea factura borrador y evento de score.
 * body: { orden_id, numero_remito?, items: [{producto_id, descripcion, cantidad_pedida, cantidad_recibida, cantidad_danada?, fecha_vencimiento?}], generar_factura?, tipo_documento?, numero_factura? }
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!b?.orden_id) return NextResponse.json({ error: 'orden requerida' }, { status: 400 })

  const adm = createAdminClient()
  const { data: orden } = await adm.from('ordenes_compra').select('*').eq('id', b.orden_id).maybeSingle<any>()
  if (!orden) return NextResponse.json({ error: 'orden inexistente' }, { status: 404 })
  const { data: ocItems } = await adm.from('orden_compra_items').select('*').eq('orden_id', b.orden_id)
  const itemsById = new Map(((ocItems ?? []) as any[]).map((i) => [i.producto_id, i]))
  const compradora = orden.sucursal_compradora_id
  const reqItems: any[] = Array.isArray(b?.items) ? b.items : (ocItems ?? []).map((i: any) => ({ producto_id: i.producto_id, descripcion: i.descripcion, cantidad_pedida: i.cantidad_total, cantidad_recibida: i.cantidad_total }))

  let conDiferencias = false
  for (const it of reqItems) {
    const ped = Number(it.cantidad_pedida ?? 0), rec = Number(it.cantidad_recibida ?? 0), dan = Number(it.cantidad_danada ?? 0)
    if (rec < ped || dan > 0) conDiferencias = true
  }

  // 1) recepción
  const { data: recep, error: eRec } = await adm.from('recepciones_mercaderia').insert({
    orden_compra_id: orden.id, sucursal_id: compradora, numero_remito: b?.numero_remito ?? null,
    fecha_recepcion: new Date().toISOString().slice(0, 10),
    estado: conDiferencias ? 'con_diferencias' : 'completa',
    recibido_por: g.userId,
  }).select('id').single()
  if (eRec) return NextResponse.json({ error: eRec.message }, { status: 400 })

  // 2) por ítem: recepcion_items + stock + lotes + transferencias
  for (const it of reqItems) {
    const pid = it.producto_id; if (!pid) continue
    const rec = Number(it.cantidad_recibida ?? 0)
    const oc = itemsById.get(pid)
    await adm.from('recepcion_items').insert({
      recepcion_id: recep.id, producto_id: pid, descripcion: it.descripcion ?? null,
      cantidad_pedida: Number(it.cantidad_pedida ?? oc?.cantidad_total ?? 0), cantidad_recibida: rec,
      cantidad_danada: Number(it.cantidad_danada ?? 0), fecha_vencimiento_producto: it.fecha_vencimiento ?? null,
    })
    if (rec <= 0) continue
    // sube stock en la compradora (entra a depósito)
    await adm.from('movimientos_stock').insert({
      producto_id: pid, sucursal_id: compradora, tipo: 'recepcion', cantidad: rec, ubicacion: 'deposito',
      motivo: `Recepción OC ${orden.codigo}`, referencia_tipo: 'recepcion', referencia_id: recep.id, created_by: g.userId,
      costo_unitario: oc?.costo_unitario ?? null,
    })
    // lote con vencimiento
    if (it.fecha_vencimiento) {
      await adm.from('lotes_productos').insert({ producto_id: pid, sucursal_id: compradora, cantidad_actual: rec, fecha_vencimiento: it.fecha_vencimiento, recepcion_id: recep.id, costo_unitario: oc?.costo_unitario ?? null })
    }
  }

  // 3) transferencias automáticas según distribución (destinos ≠ compradora)
  const porDestino = new Map<string, { producto_id: string; qty: number }[]>()
  for (const oc of (ocItems ?? []) as any[]) {
    const dist = oc.distribucion ?? {}
    for (const [suc, qty] of Object.entries(dist)) {
      const n = Number(qty) || 0
      if (suc === compradora || n <= 0) continue
      const arr = porDestino.get(suc) ?? []; arr.push({ producto_id: oc.producto_id, qty: n }); porDestino.set(suc, arr)
    }
  }
  let transferencias = 0
  for (const [destino, lineas] of porDestino) {
    const { data: tr } = await adm.from('transferencias_sucursal').insert({
      sucursal_origen_id: compradora, sucursal_destino_id: destino, estado: 'en_transito',
      fecha_solicitud: new Date().toISOString(), fecha_envio: new Date().toISOString(),
      solicitado_por: g.userId, observaciones: `Auto desde OC ${orden.codigo}`,
    }).select('id').single()
    if (!tr) continue
    transferencias++
    for (const l of lineas) {
      await adm.from('transferencia_items').insert({ transferencia_id: tr.id, producto_id: l.producto_id, cantidad_solicitada: l.qty, cantidad_enviada: l.qty })
      // sale de la compradora hacia tránsito
      await adm.from('movimientos_stock').insert({
        producto_id: l.producto_id, sucursal_id: compradora, tipo: 'transferencia_out', cantidad: -l.qty, ubicacion: 'deposito',
        motivo: `Transferencia auto OC ${orden.codigo}`, referencia_tipo: 'transferencia', referencia_id: tr.id, created_by: g.userId,
      })
    }
  }

  // 4) factura borrador a Finanzas
  let facturaId: string | null = null
  if (b?.generar_factura !== false) {
    const total = reqItems.reduce((a, it) => a + Number(it.cantidad_recibida ?? 0) * Number(itemsById.get(it.producto_id)?.costo_unitario ?? 0), 0)
    const tipoDoc = b?.tipo_documento ?? 'factura_a'
    const { data: fac } = await adm.from('facturas_proveedor').insert({
      proveedor_id: orden.proveedor_id, tipo_documento: tipoDoc, tipo_factura: TIPO_FACTURA[tipoDoc] ?? 'A',
      punto_venta: '0001', numero_factura: b?.numero_factura ?? `S/N-${orden.codigo}`,
      fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: new Date().toISOString().slice(0, 10),
      subtotal: total, total, sucursal_id: compradora, estado: 'borrador', created_by: g.userId,
      observaciones: `Generada al recibir OC ${orden.codigo}`,
    }).select('id').single()
    facturaId = fac?.id ?? null
  }

  // 5) score + estado orden
  await adm.from('proveedor_score_eventos').insert({
    proveedor_id: orden.proveedor_id, tipo: conDiferencias ? 'faltante' : 'ok', recepcion_id: recep.id,
    nota: conDiferencias ? 'Diferencias en recepción' : 'Recepción OK',
  })
  await adm.from('ordenes_compra').update({ estado: conDiferencias ? 'recibida_parcial' : 'recibida', updated_at: new Date().toISOString() }).eq('id', orden.id)

  // alerta/tarea si diferencias
  if (conDiferencias) {
    const { data: sup } = await adm.from('users_admin').select('id').eq('activo', true).in('rol', ['super_admin', 'gerente', 'comprador'])
    if (sup?.length) await adm.from('notificaciones_admin').insert(sup.map((s: any) => ({ user_id: s.id, tipo: 'alerta', prioridad: 'alta', titulo: `Diferencias en recepción OC ${orden.codigo}`, mensaje: 'Revisá el reclamo al proveedor.', url_accion: '/admin/compras/recepciones' })))
  }

  return NextResponse.json({ ok: true, recepcion_id: recep.id, transferencias, factura_id: facturaId, con_diferencias: conDiferencias })
}
