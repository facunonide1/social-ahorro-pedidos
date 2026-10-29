import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { responder } from '@/lib/cerebro/responder'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * D · La conversación.
 *
 * Con la sesión de quien habla: la voz nunca tiene más permisos que quien la
 * usa. Todo lo que entra queda en `voz_bitacora` con el texto original, y lo
 * que se propone queda guardado ahí para que al confirmar se ejecute lo que
 * se mostró y no lo que mande el navegador después.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no hay sesión' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const texto = String(body?.texto ?? '').trim().slice(0, 500)
  if (!texto) return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
  const via = body?.via === 'voz' ? 'voz' : 'texto'

  const r = await responder(sb, texto, via)
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } })
}
