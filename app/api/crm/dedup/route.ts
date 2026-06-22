import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST: resuelve un candidato de duplicado.
 *  - { accion: 'fusionar', id }  → mergea cliente_b en cliente_a (reparenta fuentes/
 *    compras/puntos, desactiva b) y marca fusionado.
 *  - { accion: 'separar', id }   → marca que NO son la misma persona.
 */
export async function POST(req: NextRequest) {
  const g = await gateCrm('editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const { accion, id } = b ?? {}
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data: dp } = await adm.from('dedup_pendientes').select('*').eq('id', id).maybeSingle()
  if (!dp) return NextResponse.json({ error: 'candidato inexistente' }, { status: 404 })

  if (accion === 'separar') {
    await adm.from('dedup_pendientes').update({ estado: 'separado' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'fusionar') {
    const [{ data: a }, { data: dup }] = await Promise.all([
      adm.from('clientes').select('*').eq('id', dp.cliente_a).maybeSingle(),
      adm.from('clientes').select('*').eq('id', dp.cliente_b).maybeSingle(),
    ])
    if (!a || !dup) return NextResponse.json({ error: 'clientes inexistentes' }, { status: 404 })

    // completar campos faltantes en A desde el duplicado, unir fuentes y sumar gasto
    const patch: Record<string, unknown> = {
      fuentes: Array.from(new Set([...(a.fuentes ?? []), ...(dup.fuentes ?? [])])),
      dni: a.dni ?? dup.dni, cuit: a.cuit ?? dup.cuit, telefono: a.telefono ?? dup.telefono,
      email: a.email ?? dup.email, fecha_nacimiento: a.fecha_nacimiento ?? dup.fecha_nacimiento,
      cuponera_user_id: a.cuponera_user_id ?? dup.cuponera_user_id,
      nivel: a.nivel ?? dup.nivel, puntos: Number(a.puntos ?? 0) + Number(dup.puntos ?? 0),
      total_gastado_12m: Number(a.total_gastado_12m ?? 0) + Number(dup.total_gastado_12m ?? 0),
      n_compras_12m: Number(a.n_compras_12m ?? 0) + Number(dup.n_compras_12m ?? 0),
    }
    await adm.from('clientes').update(patch).eq('id', a.id)

    // reparentar historiales
    await adm.from('cliente_fuentes').update({ cliente_id: a.id }).eq('cliente_id', dup.id)
    await adm.from('cliente_compras').update({ cliente_id: a.id }).eq('cliente_id', dup.id)
    await adm.from('puntos_movimientos').update({ cliente_id: a.id }).eq('cliente_id', dup.id)

    // desactivar el duplicado (preserva auditoría) + cerrar candidato
    await adm.from('clientes').update({ activo: false, notas: `Fusionado en ${a.id}` }).eq('id', dup.id)
    await adm.from('dedup_pendientes').update({ estado: 'fusionado' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
