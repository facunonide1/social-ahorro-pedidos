import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Transiciones de transferencia que MUEVEN stock (OPS · T10).
 * body: { id, accion: 'aprobar'|'enviar'|'recibir'|'cancelar' }
 *  - enviar (aprobada→en_transito): movimiento transferencia_out (−) en origen.
 *  - recibir (en_transito→recibida): movimiento transferencia_in (+) en destino.
 * El trigger movimientos_stock_aplicar deriva stock_items.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const { id, accion } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const adm = createAdminClient()
  const { data: tr } = await adm.from('transferencias_sucursal').select('*').eq('id', id).maybeSingle<any>()
  if (!tr) return NextResponse.json({ error: 'transferencia no encontrada' }, { status: 404 })
  const { data: items } = await adm.from('transferencia_items').select('*').eq('transferencia_id', id)
  const its = (items ?? []) as any[]
  const now = new Date().toISOString()

  if (accion === 'aprobar') {
    if (tr.estado !== 'solicitada') return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
    await adm.from('transferencias_sucursal').update({ estado: 'aprobada', aprobado_por: user.id }).eq('id', id)
    return NextResponse.json({ ok: true, estado: 'aprobada' })
  }

  if (accion === 'enviar') {
    if (tr.estado !== 'aprobada') return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
    // cantidad_enviada = solicitada si no está seteada
    const movs = its.map((it) => {
      const env = Number(it.cantidad_enviada ?? it.cantidad_solicitada ?? 0)
      return { it, env }
    }).filter((x) => x.env > 0)
    for (const { it, env } of movs) {
      if (it.cantidad_enviada == null) await adm.from('transferencia_items').update({ cantidad_enviada: env }).eq('id', it.id)
      await adm.from('movimientos_stock').insert({
        producto_id: it.producto_id, sucursal_id: tr.sucursal_origen_id, tipo: 'transferencia_out',
        cantidad: -env, motivo: 'Transferencia enviada', referencia_tipo: 'transferencia', referencia_id: id,
        fecha: now, created_by: user.id,
      })
    }
    await adm.from('transferencias_sucursal').update({ estado: 'en_transito', fecha_envio: now }).eq('id', id)
    return NextResponse.json({ ok: true, estado: 'en_transito' })
  }

  if (accion === 'recibir') {
    if (tr.estado !== 'en_transito') return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
    // recibido por ítem (body.recibido[itemId]) o todo lo enviado
    const recibido: Record<string, number> = body?.recibido ?? {}
    let conDiferencias = false
    for (const it of its) {
      const env = Number(it.cantidad_enviada ?? 0)
      const rec = it.id in recibido ? Number(recibido[it.id]) : env
      if (rec !== env) conDiferencias = true
      await adm.from('transferencia_items').update({ cantidad_recibida: rec }).eq('id', it.id)
      if (rec > 0) {
        await adm.from('movimientos_stock').insert({
          producto_id: it.producto_id, sucursal_id: tr.sucursal_destino_id, tipo: 'transferencia_in',
          cantidad: rec, motivo: 'Transferencia recibida', referencia_tipo: 'transferencia', referencia_id: id,
          fecha: now, created_by: user.id,
        })
      }
    }
    await adm.from('transferencias_sucursal').update({
      estado: 'recibida', fecha_recepcion: now,
      observaciones: conDiferencias ? `${tr.observaciones ?? ''}\n[Recibida con diferencias]`.trim() : tr.observaciones,
    }).eq('id', id)
    if (conDiferencias) {
      await adm.from('alertas_stock').insert({
        tipo: 'stock_critico', producto_id: its[0]?.producto_id ?? null, sucursal_id: tr.sucursal_destino_id,
        severidad: 'warning', estado: 'activa',
        datos: { nombre: 'Transferencia con diferencias', detalle: `Transferencia ${id.slice(0, 8)} recibida con diferencias` },
      }).then(() => {}, () => {})
    }
    return NextResponse.json({ ok: true, estado: 'recibida', conDiferencias })
  }

  if (accion === 'cancelar') {
    if (!['solicitada', 'aprobada'].includes(tr.estado)) return NextResponse.json({ error: 'no se puede cancelar después de enviar' }, { status: 400 })
    await adm.from('transferencias_sucursal').update({ estado: 'cancelada' }).eq('id', id)
    return NextResponse.json({ ok: true, estado: 'cancelada' })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
