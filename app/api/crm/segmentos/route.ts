import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { gateCrm } from '@/lib/crm/gate'
import { evaluarSegmento, AUTO_SEGMENTOS } from '@/lib/crm/segmentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST:
 *  - { accion:'preview', regla }                 → { count }
 *  - { accion:'guardar', nombre, regla, dinamico, descripcion? } → { id }
 *  - { accion:'guardar_auto', clave }            → persiste un segmento auto de NORA y devuelve { id }
 *  - { accion:'eliminar', id }
 */
export async function POST(req: NextRequest) {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const ctx = getSucursalActiva()

  if (b?.accion === 'preview') {
    const { count } = await evaluarSegmento(adm, b?.regla ?? {}, ctx)
    return NextResponse.json({ count })
  }

  if (b?.accion === 'eliminar') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await adm.from('segmentos').delete().eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  if (b?.accion === 'guardar_auto') {
    const def = AUTO_SEGMENTOS.find((s) => s.clave === b?.clave)
    if (!def) return NextResponse.json({ error: 'segmento auto inexistente' }, { status: 400 })
    // upsert por clave_auto
    const { data: ya } = await adm.from('segmentos').select('id').eq('clave_auto', def.clave).maybeSingle()
    const { count } = await evaluarSegmento(adm, def.regla, ctx)
    if (ya) {
      await adm.from('segmentos').update({ n_clientes: count }).eq('id', ya.id)
      return NextResponse.json({ ok: true, id: ya.id, count })
    }
    const { data, error } = await adm.from('segmentos').insert({
      nombre: def.nombre, descripcion: def.descripcion, tipo: 'auto', regla: def.regla,
      clave_auto: def.clave, n_clientes: count, dinamico: true, created_by: g.userId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, count })
  }

  if (b?.accion === 'guardar') {
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { count } = await evaluarSegmento(adm, b?.regla ?? {}, ctx)
    const { data, error } = await adm.from('segmentos').insert({
      nombre: b.nombre, descripcion: b.descripcion ?? null, tipo: 'manual', regla: b.regla ?? {},
      n_clientes: count, dinamico: b.dinamico ?? true, created_by: g.userId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, count })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
