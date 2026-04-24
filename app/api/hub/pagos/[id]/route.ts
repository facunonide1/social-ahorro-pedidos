import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { PagoEstado } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NEXT_ESTADOS: Record<PagoEstado, PagoEstado[]> = {
  solicitado: ['aprobado', 'anulado'],
  aprobado:   ['ejecutado', 'anulado'],
  ejecutado:  ['conciliado', 'anulado'],
  conciliado: [],
  anulado:    [],
}

/**
 * PATCH cambia el estado del pago (transiciones controladas) y/o
 * actualiza comprobante_url y observaciones. Si el nuevo estado es
 * 'anulado', revierte las facturas asociadas a 'aprobada'.
 */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente','tesoreria'].includes(profile.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    estado?: PagoEstado
    comprobante_url?: string | null
    observaciones?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'body_invalido' }, { status: 400 })

  const admin = createAdminClient()

  if (body.estado) {
    const { data: pagoActual } = await admin
      .from('pagos').select('estado').eq('id', ctx.params.id).maybeSingle()
    if (!pagoActual) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })

    const allowed = NEXT_ESTADOS[pagoActual.estado as PagoEstado] ?? []
    if (!allowed.includes(body.estado)) {
      return NextResponse.json({
        error: 'transicion_no_permitida',
        hint: `No se puede pasar de "${pagoActual.estado}" a "${body.estado}".`,
      }, { status: 400 })
    }

    const patch: Record<string, any> = { estado: body.estado }
    if (body.estado === 'aprobado')   patch.aprobado_por  = user.id
    if (body.estado === 'ejecutado')  patch.ejecutado_por = user.id

    const { error: upErr } = await admin.from('pagos').update(patch).eq('id', ctx.params.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    if (body.estado === 'anulado') {
      // Revertir facturas: si quedan sin pagos válidos, las marcamos aprobada
      const { data: aplics } = await admin
        .from('pago_facturas').select('factura_id').eq('pago_id', ctx.params.id)
      const facIds = (aplics ?? []).map(a => a.factura_id)
      // Borramos las aplicaciones de este pago para que el cálculo refleje la realidad
      await admin.from('pago_facturas').delete().eq('pago_id', ctx.params.id)
      for (const fid of facIds) {
        const { data: f } = await admin
          .from('facturas_proveedor').select('total').eq('id', fid).maybeSingle()
        const { data: rest } = await admin
          .from('pago_facturas').select('monto_aplicado, pagos!inner(estado)')
          .eq('factura_id', fid).neq('pagos.estado', 'anulado')
        const totalFactura = Number(f?.total ?? 0)
        const aplicado = (rest ?? []).reduce((acc: number, x: any) => acc + Number(x.monto_aplicado), 0)
        const nuevoEstado = aplicado >= totalFactura - 0.01 ? 'pagada'
                          : aplicado > 0                   ? 'pagada_parcial'
                          : 'aprobada'
        await admin.from('facturas_proveedor').update({ estado: nuevoEstado }).eq('id', fid)
      }
    }
  }

  const otrosCambios: Record<string, any> = {}
  if (body.comprobante_url !== undefined) otrosCambios.comprobante_url = body.comprobante_url
  if (body.observaciones !== undefined)   otrosCambios.observaciones   = body.observaciones
  if (Object.keys(otrosCambios).length > 0) {
    const { error: upErr } = await admin.from('pagos').update(otrosCambios).eq('id', ctx.params.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
