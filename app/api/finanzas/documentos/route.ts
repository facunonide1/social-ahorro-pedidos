import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TIPO_FACTURA: Record<string, string> = {
  factura_a: 'A', factura_b: 'B', factura_c: 'C',
  nota_credito: 'B', nota_debito: 'B', recibo: 'B', remito: 'B', gasto: 'C',
}

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'tesoreria', 'administrativo'].includes(me.rol)) {
    return { error: 'sin permiso', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/** Alta de documento a pagar (FIN · T4). Anti-duplicados por hash_dedup. */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const proveedor_id = b?.proveedor_id
  const numero = String(b?.numero ?? '').trim()
  const total = Number(b?.total)
  if (!proveedor_id || !numero || !Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: 'proveedor, número y monto (>0) requeridos' }, { status: 400 })
  }
  const tipo_documento = String(b?.tipo_documento ?? 'factura_a')
  const hash_dedup = `${proveedor_id}|${numero}|${total}`

  const adm = createAdminClient()
  if (!b?.forzar) {
    const { data: dup } = await adm.from('facturas_proveedor').select('id').eq('hash_dedup', hash_dedup).maybeSingle()
    if (dup) return NextResponse.json({ error: 'Ya existe un documento con ese proveedor, número y monto.', duplicado: true }, { status: 409 })
  }

  const esFutura = Boolean(b?.es_futura)
  const { data, error } = await adm.from('facturas_proveedor').insert({
    proveedor_id,
    tipo_documento,
    tipo_factura: TIPO_FACTURA[tipo_documento] ?? 'B',
    punto_venta: String(b?.punto_venta ?? '0001'),
    numero_factura: numero,
    fecha_emision: b?.fecha_emision ?? new Date().toISOString().slice(0, 10),
    fecha_vencimiento: b?.fecha_vencimiento ?? new Date().toISOString().slice(0, 10),
    subtotal: total,
    total,
    sucursal_id: b?.sucursal_id ?? null,
    forma_pago_prevista: b?.forma_pago_prevista ?? null,
    es_futura: esFutura,
    hash_dedup,
    estado: esFutura ? 'programada_pago' : 'pendiente_aprobacion',
    observaciones: b?.observaciones ?? null,
    created_by: g.userId,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
