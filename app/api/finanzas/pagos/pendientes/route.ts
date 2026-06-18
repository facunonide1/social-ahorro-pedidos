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
  if (!me || !me.activo || !['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'].includes(me.rol)) {
    return { error: 'sin permiso', status: 403 as const }
  }
  return { ok: true as const }
}

const ABIERTOS = ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']

/** Documentos pendientes de pago de un proveedor + saldo aplicado (FIN · T5). */
export async function GET(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const proveedorId = req.nextUrl.searchParams.get('proveedor_id')
  if (!proveedorId) return NextResponse.json({ error: 'proveedor_id requerido' }, { status: 400 })

  const adm = createAdminClient()
  const { data: docs, error } = await adm
    .from('facturas_proveedor')
    .select('id, tipo_documento, numero_factura, total, fecha_emision, fecha_vencimiento, estado')
    .eq('proveedor_id', proveedorId)
    .in('estado', ABIERTOS)
    .order('fecha_vencimiento', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const ids = (docs ?? []).map((d) => d.id)
  const aplicadoPorFactura: Record<string, number> = {}
  if (ids.length) {
    const { data: aplic } = await adm.from('pago_facturas').select('factura_id, monto_aplicado').in('factura_id', ids)
    for (const a of aplic ?? []) aplicadoPorFactura[a.factura_id] = (aplicadoPorFactura[a.factura_id] ?? 0) + Number(a.monto_aplicado)
  }

  const items = (docs ?? []).map((d) => {
    const esNC = d.tipo_documento === 'nota_credito'
    const aplicado = aplicadoPorFactura[d.id] ?? 0
    const pendiente = Math.max(0, Number(d.total) - aplicado)
    return {
      id: d.id, tipo: d.tipo_documento, numero: d.numero_factura,
      total: Number(d.total), aplicado, pendiente, emision: d.fecha_emision,
      vencimiento: d.fecha_vencimiento, estado: d.estado, es_nota_credito: esNC,
    }
  })

  return NextResponse.json({ items })
}
