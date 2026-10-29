import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { confirmar } from '@/lib/cerebro/confirmar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * F · El toque que confirma. Recibe el id de la bitácora, no la propuesta:
 * se ejecuta lo que se mostró. Con la sesión del dueño.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, texto: 'no hay sesión' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, texto: 'body inválido' }, { status: 400 }) }
  const id = String(body?.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, texto: 'falta el id' }, { status: 400 })
  const r = await confirmar(sb, user.id, id, body?.descartar === true)
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } })
}
