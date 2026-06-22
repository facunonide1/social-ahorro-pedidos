import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'
import { sumarPuntos } from '@/lib/crm/puntos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST:
 *  - { accion:'regla', evento, puntos, ratio_monto, activa } → upsert regla
 *  - { accion:'sumar', cliente_id, evento, puntos?, monto? }  → suma manual (+ sync cuponera)
 */
export async function POST(req: NextRequest) {
  const g = await gateCrm('editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'regla') {
    if (!b?.evento) return NextResponse.json({ error: 'evento requerido' }, { status: 400 })
    const { error } = await adm.from('puntos_reglas').upsert({
      evento: b.evento, descripcion: b.descripcion ?? null, puntos: Number(b.puntos ?? 0),
      ratio_monto: b.ratio_monto != null ? Number(b.ratio_monto) : null, activa: b.activa ?? true, updated_at: new Date().toISOString(),
    }, { onConflict: 'evento' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (b?.accion === 'sumar') {
    if (!b?.cliente_id || !b?.evento) return NextResponse.json({ error: 'cliente y evento requeridos' }, { status: 400 })
    const r = await sumarPuntos(adm, b.cliente_id, b.evento, { monto: b.monto, puntos: b.puntos })
    return NextResponse.json({ ok: true, ...r })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
