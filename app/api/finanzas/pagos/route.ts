import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Umbral de aprobación (config simple por ahora — OS-4b · C). Pago por encima
// de este monto queda 'solicitado' y genera la aprobación automática.
export const UMBRAL_PAGO_APROBACION = 200_000

const ORIGEN_METODO: Record<string, string> = {
  efectivo_sucursal: 'efectivo', cuenta_bancaria: 'transferencia', cheque: 'cheque', mercadopago: 'otro',
}

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me || !me.activo || !puede(me.rol, me.permisos_custom ?? null, 'finanzas', 'aprobar')) {
    return { error: 'sin permiso para ejecutar pagos (finanzas:aprobar)', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/**
 * Registra un pago a proveedor (FIN · T5 + OS-4b · C).
 * Origen EXPLÍCITO (cuenta bancaria / caja general / cheque). Si el egreso
 * supera el umbral, queda 'solicitado' y crea la aprobación automática
 * (tipo pago_alto); recién al aprobarse se ejecutan los efectos.
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const adm = createAdminClient()
  const r = await crearPago(adm, b, g.userId)
  if ('error' in r) return NextResponse.json({ error: r.error, frena: r.frena }, { status: r.status })
  return NextResponse.json(r)
}

/**
 * Crea un pago a proveedor con origen explícito. Núcleo REUSADO por el endpoint
 * y por el motor conversacional de NORA (N-01: misma lógica, mismos permisos —
 * quien llama ya validó el permiso finanzas:aprobar). Aplica el umbral de
 * aprobación de OS-4b. Devuelve { error, status } o { ok, id, ... }.
 */
export async function crearPago(adm: any, b: any, userId: string): Promise<any> {
  const proveedor_id = b?.proveedor_id
  const origen_tipo = String(b?.origen_tipo ?? '')
  const aplicaciones = Array.isArray(b?.aplicaciones) ? b.aplicaciones : []
  const retenciones = Math.max(0, Number(b?.retenciones ?? 0))
  if (!proveedor_id) return { error: 'proveedor requerido', status: 400 }
  if (!ORIGEN_METODO[origen_tipo]) return { error: 'elegí un origen del pago (banco, caja o cheque)', status: 400 }
  if (!aplicaciones.length) return { error: 'seleccioná al menos un documento', status: 400 }

  const ids = aplicaciones.map((a: any) => a.factura_id)
  const { data: facts } = await adm.from('facturas_proveedor').select('id, total, tipo_documento, estado').in('id', ids)
  const factById = new Map((facts ?? []).map((f) => [f.id, f]))

  let bruto = 0
  for (const a of aplicaciones) {
    const f = factById.get(a.factura_id)
    if (!f) return { error: 'documento inexistente', status: 400 }
    const m = Number(a.monto)
    if (!Number.isFinite(m) || m <= 0) return { error: 'monto de aplicación inválido', status: 400 }
    bruto += f.tipo_documento === 'nota_credito' ? -m : m
  }
  if (bruto <= 0) return { error: 'el neto a pagar debe ser positivo', status: 400 }

  const montoEgreso = Math.max(0, bruto - retenciones)
  const fecha_pago = b?.fecha_pago ?? new Date().toISOString().slice(0, 10)
  const pendiente = montoEgreso > UMBRAL_PAGO_APROBACION

  if (origen_tipo === 'efectivo_sucursal') {
    if (!b?.origen_sucursal_id) return { error: 'sucursal de efectivo requerida', status: 400 }
    if (!pendiente) {
      const { data: cg } = await adm.from('caja_general').select('saldo_actual').eq('sucursal_id', b.origen_sucursal_id).eq('tipo', 'caja_general').maybeSingle()
      if (Number(cg?.saldo_actual ?? 0) < montoEgreso) return { error: 'Efectivo insuficiente en la caja general.', frena: true, status: 422 }
    }
  } else if (origen_tipo === 'cuenta_bancaria') {
    if (!b?.origen_cuenta_id) return { error: 'cuenta bancaria requerida', status: 400 }
  } else if (origen_tipo === 'cheque') {
    if (!b?.cheque?.numero || !b?.cheque?.banco) return { error: 'número y banco del cheque requeridos', status: 400 }
  }

  const numero_orden_pago = `OP-${fecha_pago.replace(/-/g, '')}-${Math.floor(Number(String(bruto).replace('.', '')) % 10000).toString().padStart(4, '0')}`
  const retDetalle = origen_tipo === 'cheque' ? { ...(b?.retencion_detalle ?? {}), _cheque: b.cheque } : (b?.retencion_detalle ?? null)

  const { data: pago, error: ePago } = await adm.from('pagos').insert({
    proveedor_id, numero_orden_pago, fecha_pago, metodo_pago: ORIGEN_METODO[origen_tipo],
    monto_total: bruto, retenciones_aplicadas: retenciones, monto_neto: montoEgreso,
    estado: pendiente ? 'solicitado' : 'ejecutado',
    origen_tipo,
    origen_sucursal_id: origen_tipo === 'efectivo_sucursal' ? b.origen_sucursal_id : null,
    origen_cuenta_id: origen_tipo === 'cuenta_bancaria' ? b.origen_cuenta_id : null,
    retencion_detalle: retDetalle, observaciones: b?.observaciones ?? null, comprobante_url: b?.comprobante_url ?? null,
    origen_registro: b?.origen_registro ?? null,
    solicitado_por: userId, aprobado_por: pendiente ? null : userId, ejecutado_por: pendiente ? null : userId,
  }).select('id').single()
  if (ePago) return { error: ePago.message, status: 400 }

  for (const a of aplicaciones) await adm.from('pago_facturas').insert({ pago_id: pago.id, factura_id: a.factura_id, monto_aplicado: Number(a.monto) })

  if (pendiente) {
    const { data: prov } = await adm.from('proveedores').select('razon_social').eq('id', proveedor_id).maybeSingle<any>()
    await adm.from('aprobaciones').insert({
      tipo: 'pago_alto', entidad_tipo: 'pago', entidad_id: pago.id, monto_afectado: montoEgreso,
      descripcion: `Pago ${numero_orden_pago} a ${prov?.razon_social ?? 'proveedor'} por $${Math.round(montoEgreso).toLocaleString('es-AR')}`,
      solicitante_id: userId, rol_aprobador: 'super_admin', estado: 'pendiente',
    })
    const { data: sup } = await adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true)
    if (sup?.length) await adm.from('notificaciones_admin').insert((sup as any[]).map((s) => ({ user_id: s.id, tipo: 'aprobacion', prioridad: 'alta', titulo: 'Pago pendiente de aprobación', mensaje: `${numero_orden_pago} por $${Math.round(montoEgreso).toLocaleString('es-AR')} espera tu OK.`, url_accion: '/admin/aprobaciones' })))
    return { ok: true, id: pago.id, numero_orden_pago, pendiente: true, monto_egreso: montoEgreso }
  }

  await ejecutarEfectosPago(adm, pago.id, userId)
  return { ok: true, id: pago.id, numero_orden_pago, monto_total: bruto, monto_egreso: montoEgreso, pendiente: false }
}

/**
 * Aplica los efectos reales de un pago (factura→pagada + movimiento de dinero
 * según origen). Reusado al ejecutar directo y al aprobar. Valida saldo en
 * efectivo. Idempotente por origen (no re-mueve si ya hay movimiento del pago).
 */
export async function ejecutarEfectosPago(adm: any, pagoId: string, userId: string) {
  const { data: pago } = await adm.from('pagos').select('*').eq('id', pagoId).maybeSingle()
  if (!pago) throw new Error('pago inexistente')
  const montoEgreso = Number(pago.monto_neto)

  // 1) estado de cada factura aplicada
  const { data: aplic } = await adm.from('pago_facturas').select('factura_id, monto_aplicado').eq('pago_id', pagoId)
  for (const a of (aplic ?? []) as any[]) {
    const { data: f } = await adm.from('facturas_proveedor').select('total').eq('id', a.factura_id).maybeSingle()
    const { data: all } = await adm.from('pago_facturas').select('monto_aplicado').eq('factura_id', a.factura_id)
    const totalAplic = (all ?? []).reduce((s: number, x: any) => s + Number(x.monto_aplicado), 0)
    const nuevoEstado = totalAplic >= Number(f?.total ?? 0) - 0.01 ? 'pagada' : 'pagada_parcial'
    await adm.from('facturas_proveedor').update({ estado: nuevoEstado }).eq('id', a.factura_id)
  }

  // 2) movimiento de dinero según origen (guardado contra doble aplicación)
  const { count: ya } = await adm.from('caja_general_movimientos').select('id', { count: 'exact', head: true }).eq('referencia_tipo', 'pago').eq('referencia_id', pagoId)
  const { count: yaBanco } = await adm.from('movimientos_bancarios').select('id', { count: 'exact', head: true }).eq('pago_id', pagoId)
  if ((ya ?? 0) > 0 || (yaBanco ?? 0) > 0) return

  if (pago.origen_tipo === 'efectivo_sucursal' && pago.origen_sucursal_id) {
    const { data: cg } = await adm.from('caja_general').select('id, saldo_actual').eq('sucursal_id', pago.origen_sucursal_id).eq('tipo', 'caja_general').maybeSingle()
    if (!cg || Number(cg.saldo_actual ?? 0) < montoEgreso) throw new Error('Saldo insuficiente en la caja general.')
    await adm.from('caja_general_movimientos').insert({ caja_general_id: cg.id, tipo: 'pago_proveedor', monto: -montoEgreso, referencia_tipo: 'pago', referencia_id: pagoId, estado: 'aprobado', solicitado_por: userId, aprobado_por: userId, notas: `Pago ${pago.numero_orden_pago}` })
  } else if (pago.origen_tipo === 'cuenta_bancaria' && pago.origen_cuenta_id) {
    await adm.from('movimientos_bancarios').insert({ cuenta_bancaria_id: pago.origen_cuenta_id, fecha: pago.fecha_pago, tipo: 'egreso', categoria: 'pago_proveedor', monto: montoEgreso, descripcion: `Pago ${pago.numero_orden_pago}`, pago_id: pagoId })
  } else if (pago.origen_tipo === 'cheque') {
    const chq = pago.retencion_detalle?._cheque
    if (chq?.numero && chq?.banco) {
      const { data: c } = await adm.from('cheques').insert({ tipo: 'emitido', numero: String(chq.numero), banco: String(chq.banco), monto: montoEgreso, fecha_emision: pago.fecha_pago, fecha_cobro_estimada: chq.fecha_cobro_estimada ?? null, estado: 'emitido', proveedor_id: pago.proveedor_id, created_by: userId }).select('id').single()
      if (c) await adm.from('pagos').update({ cheque_id: c.id }).eq('id', pagoId)
    }
  }
}
