import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST:
 *  - { accion:'alta', nombre, cuit, email?, telefono?, limite_credito?, saldo? } → crea cliente B2B + cta cte
 *  - { accion:'recurrente', cliente_id, nombre, frecuencia, proximo } → pedido recurrente
 */
export async function POST(req: NextRequest) {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'alta') {
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data: cli, error } = await adm.from('clientes').insert({
      tipo: 'b2b', nombre: b.nombre, cuit: b.cuit ?? null, email: b.email ?? null, telefono: b.telefono ?? null,
      fuentes: ['sifaco'],
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await adm.from('b2b_cuenta_corriente').insert({
      cliente_id: cli.id, saldo: Number(b.saldo ?? 0), limite_credito: Number(b.limite_credito ?? 0),
    })
    return NextResponse.json({ ok: true, id: cli.id })
  }

  if (b?.accion === 'recurrente') {
    if (!b?.cliente_id) return NextResponse.json({ error: 'cliente requerido' }, { status: 400 })
    const { error } = await adm.from('b2b_pedidos_recurrentes').insert({
      cliente_id: b.cliente_id, nombre: b.nombre ?? 'Pedido recurrente',
      productos: b.productos ?? [], frecuencia: b.frecuencia ?? 'mensual', proximo: b.proximo ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
