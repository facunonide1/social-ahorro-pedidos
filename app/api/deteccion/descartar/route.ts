import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * D.5 · DESCARTAR, CON UN MOTIVO.
 *
 * ── POR QUÉ CON LA SESIÓN DE QUIEN DESCARTA Y NO CON EL CLIENTE DE SERVICIO ─
 *
 * Porque `deteccion_descartar` guarda `auth.uid()`. Con el cliente de
 * servicio, los descartes quedarían todos sin dueño, y el día que alguien
 * pregunte por qué un detector está callado la respuesta sería «alguien lo
 * descartó tres veces» — que no es una respuesta.
 *
 * El motivo lo valida la función contra el catálogo: acá no se valida de
 * nuevo. Una validación en dos lugares es una que se va a desincronizar.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  let body: { anomalia_id?: string; motivo?: string; nota?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }) }

  if (!body.anomalia_id || !body.motivo) {
    return NextResponse.json({ error: 'faltan el hallazgo o el motivo' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('deteccion_descartar', {
    p_anomalia: body.anomalia_id,
    p_motivo: body.motivo,
    p_nota: body.nota?.trim() || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as { ok: boolean; por_que?: string }
  if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo' }, { status: 400 })
  return NextResponse.json(r)
}
