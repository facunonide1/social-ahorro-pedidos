import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// origen → metodo_pago (enum legacy)
const ORIGEN_METODO: Record<string, string> = {
  efectivo_sucursal: 'efectivo',
  cuenta_bancaria: 'transferencia',
  cheque: 'cheque',
  mercadopago: 'otro',
}

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  // ejecutar un pago = aprobar en finanzas (permiso fino, 403 real)
  if (!me || !me.activo || !puede(me.rol, me.permisos_custom ?? null, 'finanzas', 'aprobar')) {
    return { error: 'sin permiso para ejecutar pagos (finanzas:aprobar)', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/**
 * Ejecuta un pago a proveedor (FIN · T5).
 * Mueve dinero REAL desde un único origen y FRENA si no alcanza el efectivo.
 * body: { proveedor_id, fecha_pago, origen_tipo, origen_sucursal_id?, origen_cuenta_id?,
 *         retenciones?: number, retencion_detalle?, aplicaciones: [{factura_id, monto}],
 *         cheque?: { numero, banco, fecha_cobro_estimada }, observaciones? }
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const proveedor_id = b?.proveedor_id
  const origen_tipo = String(b?.origen_tipo ?? '')
  const aplicaciones = Array.isArray(b?.aplicaciones) ? b.aplicaciones : []
  const retenciones = Math.max(0, Number(b?.retenciones ?? 0))

  if (!proveedor_id) return NextResponse.json({ error: 'proveedor requerido' }, { status: 400 })
  if (!ORIGEN_METODO[origen_tipo]) return NextResponse.json({ error: 'origen inválido' }, { status: 400 })
  if (!aplicaciones.length) return NextResponse.json({ error: 'seleccioná al menos un documento' }, { status: 400 })

  // monto bruto = suma de aplicaciones (las NC restan)
  const adm = createAdminClient()
  const ids = aplicaciones.map((a: any) => a.factura_id)
  const { data: facts } = await adm.from('facturas_proveedor').select('id, total, tipo_documento, estado').in('id', ids)
  const factById = new Map((facts ?? []).map((f) => [f.id, f]))

  let bruto = 0
  for (const a of aplicaciones) {
    const f = factById.get(a.factura_id)
    if (!f) return NextResponse.json({ error: 'documento inexistente' }, { status: 400 })
    const m = Number(a.monto)
    if (!Number.isFinite(m) || m <= 0) return NextResponse.json({ error: 'monto de aplicación inválido' }, { status: 400 })
    bruto += f.tipo_documento === 'nota_credito' ? -m : m
  }
  if (bruto <= 0) return NextResponse.json({ error: 'el neto a pagar debe ser positivo' }, { status: 400 })

  const montoEgreso = Math.max(0, bruto - retenciones) // lo que sale del origen
  const fecha_pago = b?.fecha_pago ?? new Date().toISOString().slice(0, 10)

  // ===== Validación de fondos por origen + datos del movimiento =====
  let caja_general_id: string | null = null
  if (origen_tipo === 'efectivo_sucursal') {
    const suc = b?.origen_sucursal_id
    if (!suc) return NextResponse.json({ error: 'sucursal de efectivo requerida' }, { status: 400 })
    const { data: cg } = await adm.from('caja_general').select('id, saldo_actual').eq('sucursal_id', suc).eq('tipo', 'caja_general').maybeSingle()
    const saldo = Number(cg?.saldo_actual ?? 0)
    if (!cg || saldo < montoEgreso) {
      return NextResponse.json({ error: 'Efectivo insuficiente en la caja general de la sucursal.', frena: true, disponible: saldo, requerido: montoEgreso }, { status: 422 })
    }
    caja_general_id = cg.id
  } else if (origen_tipo === 'cuenta_bancaria') {
    if (!b?.origen_cuenta_id) return NextResponse.json({ error: 'cuenta bancaria requerida' }, { status: 400 })
  } else if (origen_tipo === 'cheque') {
    if (!b?.cheque?.numero || !b?.cheque?.banco) return NextResponse.json({ error: 'número y banco del cheque requeridos' }, { status: 400 })
  }

  // ===== Insertar pago =====
  const numero_orden_pago = `OP-${fecha_pago.replace(/-/g, '')}-${Math.floor(Number(String(bruto).replace('.', '')) % 10000).toString().padStart(4, '0')}`
  const { data: pago, error: ePago } = await adm.from('pagos').insert({
    proveedor_id,
    numero_orden_pago,
    fecha_pago,
    metodo_pago: ORIGEN_METODO[origen_tipo],
    monto_total: bruto,
    retenciones_aplicadas: retenciones,
    monto_neto: montoEgreso,
    estado: 'ejecutado',
    origen_tipo,
    origen_sucursal_id: origen_tipo === 'efectivo_sucursal' ? b.origen_sucursal_id : null,
    origen_cuenta_id: origen_tipo === 'cuenta_bancaria' ? b.origen_cuenta_id : null,
    retencion_detalle: b?.retencion_detalle ?? null,
    observaciones: b?.observaciones ?? null,
    solicitado_por: g.userId,
    aprobado_por: g.userId,
    ejecutado_por: g.userId,
  }).select('id').single()
  if (ePago) return NextResponse.json({ error: ePago.message }, { status: 400 })

  // ===== Aplicaciones + estado de cada documento =====
  for (const a of aplicaciones) {
    const f = factById.get(a.factura_id)!
    await adm.from('pago_facturas').insert({ pago_id: pago.id, factura_id: a.factura_id, monto_aplicado: Number(a.monto) })
    // total aplicado acumulado
    const { data: ap } = await adm.from('pago_facturas').select('monto_aplicado').eq('factura_id', a.factura_id)
    const totalAplic = (ap ?? []).reduce((s, x) => s + Number(x.monto_aplicado), 0)
    const nuevoEstado = totalAplic >= Number(f.total) - 0.01 ? 'pagada' : 'pagada_parcial'
    await adm.from('facturas_proveedor').update({ estado: nuevoEstado }).eq('id', a.factura_id)
  }

  // ===== Movimiento de dinero según origen =====
  if (origen_tipo === 'efectivo_sucursal' && caja_general_id) {
    await adm.from('caja_general_movimientos').insert({
      caja_general_id, tipo: 'pago_proveedor', monto: -montoEgreso,
      referencia_tipo: 'pago', referencia_id: pago.id, estado: 'aprobado',
      solicitado_por: g.userId, aprobado_por: g.userId,
      notas: `Pago ${numero_orden_pago}`,
    })
  } else if (origen_tipo === 'cuenta_bancaria') {
    await adm.from('movimientos_bancarios').insert({
      cuenta_bancaria_id: b.origen_cuenta_id, fecha: fecha_pago, tipo: 'egreso',
      categoria: 'pago_proveedor', monto: montoEgreso, descripcion: `Pago ${numero_orden_pago}`,
      pago_id: pago.id,
    })
  } else if (origen_tipo === 'cheque') {
    const { data: chq } = await adm.from('cheques').insert({
      tipo: 'emitido', numero: String(b.cheque.numero), banco: String(b.cheque.banco),
      monto: montoEgreso, fecha_emision: fecha_pago, fecha_cobro_estimada: b.cheque.fecha_cobro_estimada ?? null,
      estado: 'emitido', proveedor_id, created_by: g.userId,
    }).select('id').single()
    if (chq) await adm.from('pagos').update({ cheque_id: chq.id }).eq('id', pago.id)
  }

  return NextResponse.json({ ok: true, id: pago.id, numero_orden_pago, monto_total: bruto, monto_egreso: montoEgreso })
}
