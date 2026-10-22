import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * B.7 · CERRAR UN ERROR DE CANAL.
 *
 * Con la sesión de quien cierra, porque `canal_error_resolver` guarda
 * `auth.uid()` y mira el rol adentro: un error cerrado sin dueño es un error
 * que nadie cerró, y la tarea de control no sabría a quién mirar.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  let body: { anomalia_id?: string; que_se_hizo?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  if (!body.anomalia_id || !body.que_se_hizo?.trim()) {
    return NextResponse.json({ error: 'faltan el hallazgo o qué se hizo' }, { status: 400 })
  }

  const { data, error } = await sb.rpc('canal_error_resolver', {
    p_anomalia: body.anomalia_id,
    p_que_se_hizo: body.que_se_hizo,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as { ok: boolean; por_que?: string }
  if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo' }, { status: 400 })
  return NextResponse.json(r)
}
