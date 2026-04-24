import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { MetodoPago } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Crea un pago + sus aplicaciones a facturas (M:N) en un solo
 * "movimiento". Si falla la inserción de aplicaciones, borra el
 * pago para no dejar huérfanos.
 *
 * Body:
 * {
 *   proveedor_id, fecha_pago (YYYY-MM-DD), metodo_pago, cuenta_bancaria_origen,
 *   monto_total, retenciones_aplicadas, observaciones,
 *   aplicaciones: [{ factura_id, monto_aplicado }]
 * }
 *
 * El número OP-YYYY-NNNN lo asigna el trigger pagos_assign_numero.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente','tesoreria'].includes(profile.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    proveedor_id?: string
    fecha_pago?: string
    metodo_pago?: MetodoPago
    cuenta_bancaria_origen?: string
    monto_total?: number
    retenciones_aplicadas?: number
    observaciones?: string
    aplicaciones?: Array<{ factura_id: string; monto_aplicado: number }>
  } | null

  if (!body?.proveedor_id || !body.fecha_pago || !body.metodo_pago) {
    return NextResponse.json({ error: 'proveedor_fecha_metodo_requeridos' }, { status: 400 })
  }
  const monto = Number(body.monto_total) || 0
  const reten = Number(body.retenciones_aplicadas) || 0
  if (monto <= 0) return NextResponse.json({ error: 'monto_invalido' }, { status: 400 })

  const aplicaciones = (body.aplicaciones ?? []).filter(a => a.factura_id && Number(a.monto_aplicado) > 0)
  const sumaAplicaciones = aplicaciones.reduce((a, x) => a + Number(x.monto_aplicado), 0)
  if (sumaAplicaciones > 0 && Math.abs(sumaAplicaciones - monto) > 0.01) {
    return NextResponse.json({
      error: 'aplicaciones_no_coinciden_con_monto',
      hint: `La suma aplicada ($${sumaAplicaciones}) tiene que ser igual al monto del pago ($${monto}).`,
    }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: pagoRow, error: pagoErr } = await admin
    .from('pagos').insert({
      proveedor_id: body.proveedor_id,
      fecha_pago: body.fecha_pago,
      metodo_pago: body.metodo_pago,
      cuenta_bancaria_origen: body.cuenta_bancaria_origen?.trim() || null,
      monto_total: monto,
      retenciones_aplicadas: reten,
      monto_neto: monto - reten,
      moneda: 'ARS',
      estado: 'solicitado',
      observaciones: body.observaciones?.trim() || null,
      solicitado_por: user.id,
    })
    .select('id, numero_orden_pago')
    .maybeSingle()

  if (pagoErr || !pagoRow) {
    return NextResponse.json({ error: pagoErr?.message ?? 'pago_insert_failed' }, { status: 500 })
  }

  if (aplicaciones.length > 0) {
    const apliPayload = aplicaciones.map(a => ({
      pago_id: pagoRow.id,
      factura_id: a.factura_id,
      monto_aplicado: Number(a.monto_aplicado),
    }))
    const { error: apliErr } = await admin.from('pago_facturas').insert(apliPayload)
    if (apliErr) {
      // rollback
      await admin.from('pagos').delete().eq('id', pagoRow.id)
      return NextResponse.json({ error: apliErr.message }, { status: 500 })
    }

    // Actualizar estado de cada factura según monto cubierto
    for (const a of aplicaciones) {
      const { data: f } = await admin
        .from('facturas_proveedor').select('total').eq('id', a.factura_id).maybeSingle()
      const { data: aplics } = await admin
        .from('pago_facturas').select('monto_aplicado').eq('factura_id', a.factura_id)
      const totalFactura = Number(f?.total ?? 0)
      const totalAplicado = (aplics ?? []).reduce((acc, x) => acc + Number(x.monto_aplicado), 0)
      const nuevoEstado = totalAplicado >= totalFactura - 0.01 ? 'pagada'
                         : totalAplicado > 0                  ? 'pagada_parcial'
                         : null
      if (nuevoEstado) {
        await admin.from('facturas_proveedor').update({ estado: nuevoEstado }).eq('id', a.factura_id)
      }
    }
  }

  return NextResponse.json({ ok: true, pagoId: pagoRow.id, numero: pagoRow.numero_orden_pago })
}
