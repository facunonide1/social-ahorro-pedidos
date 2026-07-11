import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Efectos de una devolución a proveedor al enviarse (COMPRAS · T7):
 * descuenta stock (salida), crea nota de crédito esperada en Finanzas y registra
 * evento de score. Idempotente: si ya hay movimientos referenciando la devolución
 * no vuelve a aplicar.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo'].includes(me.rol)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!b?.devolucion_id) return NextResponse.json({ error: 'devolucion requerida' }, { status: 400 })

  const adm = createAdminClient()

  // OS-4a · B: descartar un reclamo (ej. diferencia a favor) con motivo registrado.
  if (b?.accion === 'descartar') {
    const motivo = String(b?.motivo ?? '').trim()
    if (motivo.length < 3) return NextResponse.json({ error: 'poné un motivo para descartar' }, { status: 400 })
    await adm.from('devoluciones_proveedor').update({ estado: 'descartada', descartado_por: user.id, descartado_motivo: motivo, proximo_recordatorio_at: null }).eq('id', b.devolucion_id)
    return NextResponse.json({ ok: true, descartada: true })
  }

  // Idempotencia
  const { count: yaAplicado } = await adm.from('movimientos_stock').select('id', { count: 'exact', head: true }).eq('referencia_tipo', 'devolucion').eq('referencia_id', b.devolucion_id)
  if ((yaAplicado ?? 0) > 0) return NextResponse.json({ ok: true, skipped: true })

  const { data: dev } = await adm.from('devoluciones_proveedor').select('*').eq('id', b.devolucion_id).maybeSingle<any>()
  if (!dev) return NextResponse.json({ error: 'devolución inexistente' }, { status: 404 })
  const { data: items } = await adm.from('devolucion_items').select('producto_id, cantidad').eq('devolucion_id', b.devolucion_id)

  // 1) descuenta stock (salida) en la sucursal de la devolución
  for (const it of (items ?? []) as any[]) {
    if (!it.producto_id || !(Number(it.cantidad) > 0)) continue
    await adm.from('movimientos_stock').insert({
      producto_id: it.producto_id, sucursal_id: dev.sucursal_id, tipo: 'devolucion', cantidad: -Number(it.cantidad), ubicacion: 'deposito',
      motivo: `Devolución a proveedor (${dev.motivo ?? ''})`, referencia_tipo: 'devolucion', referencia_id: dev.id, created_by: user.id,
    })
  }

  // 2) nota de crédito esperada (Finanzas)
  await adm.from('facturas_proveedor').insert({
    proveedor_id: dev.proveedor_id, tipo_documento: 'nota_credito', tipo_factura: 'A',
    punto_venta: '0001', numero_factura: `NC-ESP-${dev.numero_remito_devolucion ?? dev.id.slice(0, 8)}`,
    fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: new Date().toISOString().slice(0, 10),
    subtotal: 0, total: 0, sucursal_id: dev.sucursal_id, estado: 'borrador', created_by: user.id,
    observaciones: 'Nota de crédito esperada por devolución',
  })

  // 3) evento de score
  await adm.from('proveedor_score_eventos').insert({ proveedor_id: dev.proveedor_id, tipo: 'danado', nota: `Devolución: ${dev.motivo ?? 'sin motivo'}` })

  // 4) OS-4a · seguimiento: pasa a 'enviada' y arma el próximo recordatorio (N días).
  const N = Number(b?.dias_recordatorio) > 0 ? Number(b.dias_recordatorio) : 7
  await adm.from('devoluciones_proveedor').update({
    estado: 'enviada', proximo_recordatorio_at: new Date(Date.now() + N * 86_400_000).toISOString(),
  }).eq('id', dev.id)

  return NextResponse.json({ ok: true })
}
