import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { quienPuedeVer, siApagada } from '@/lib/precios/servidor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/precios/mejor?producto=<uuid>&dias=7 · mejor_proveedor(producto).
 *
 * Con un solo proveedor `mejor` es null: está en `todos` y no hay con qué comparar.
 * Sin lecturas aceptadas recientes, `mejor` es null con el motivo, no cero.
 */
export async function GET(req: NextRequest) {
  const apagada = siApagada()
  if (apagada) return apagada

  const url = new URL(req.url)
  const producto = url.searchParams.get('producto') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(producto)) {
    return NextResponse.json({ error: 'producto tiene que ser un uuid' }, { status: 400 })
  }
  const diasTexto = url.searchParams.get('dias') ?? '7'
  if (!/^\d{1,2}$/.test(diasTexto) || Number(diasTexto) < 1 || Number(diasTexto) > 90) {
    return NextResponse.json({ error: 'dias tiene que ser un entero entre 1 y 90' }, { status: 400 })
  }
  const dias = Number(diasTexto)

  // Los parámetros se validan antes de la sesión: un pedido mal armado no llega ni a la base.
  const quien = await quienPuedeVer(createClient())
  if (quien instanceof NextResponse) return quien

  const { data, error } = await createAdminClient().rpc('mejor_proveedor', { p_producto: producto, p_dias: dias })
  if (error) {
    console.error('[precios] mejor_proveedor:', error.message)
    return NextResponse.json({ error: 'no se pudo consultar' }, { status: 500 })
  }
  return NextResponse.json(data)
}
