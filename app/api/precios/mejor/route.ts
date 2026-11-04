import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { quienPuedeVer, siApagada } from '@/lib/precios/servidor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/precios/mejor?producto=<uuid>&dias=7 · mejor_proveedor(producto).
 *
 * Con un solo proveedor no dice «el mejor»: dice que no hay con qué comparar.
 * Sin lecturas aceptadas recientes, `mejor` es null con el motivo, no cero.
 */
export async function GET(req: NextRequest) {
  const apagada = siApagada()
  if (apagada) return apagada

  const quien = await quienPuedeVer(createClient())
  if (quien instanceof NextResponse) return quien

  const url = new URL(req.url)
  const producto = url.searchParams.get('producto') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(producto)) return NextResponse.json({ error: 'falta producto (uuid)' }, { status: 400 })
  const dias = Math.min(90, Math.max(1, Number(url.searchParams.get('dias') ?? 7) || 7))

  const { data, error } = await createAdminClient().rpc('mejor_proveedor', { p_producto: producto, p_dias: dias })
  if (error) {
    console.error('[precios] mejor_proveedor:', error.message)
    return NextResponse.json({ error: 'no se pudo consultar' }, { status: 500 })
  }
  return NextResponse.json(data)
}
