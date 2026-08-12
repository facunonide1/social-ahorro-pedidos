import { NextResponse } from 'next/server'

import { cerrarConteo } from '@/lib/conteo/cerrar'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cierra la zona y devuelve el resultado.
 *
 * El permiso se chequea con el cliente de sesión —si no puede ver el conteo, no
 * lo puede cerrar— y recién después se cierra con el cliente de administración,
 * que es el único que puede escribir la esperada.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: visible } = await sb.from('cnt_conteos').select('id').eq('id', params.id).maybeSingle()
  if (!visible) return NextResponse.json({ error: 'no existe o no lo podés ver' }, { status: 404 })

  const r = await cerrarConteo(params.id, user.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, resultado: r.resultado, consecuencias: r.consecuencias })
}
