import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * I · CERRAR UN ERROR DECLARANDO QUE NO SE PUEDE.
 *
 * ── POR QUÉ ESTO NO ES LO MISMO QUE RESOLVERLO ──────────────────────────────
 *
 * Porque «lo arreglé» y «no se puede arreglar desde acá» son dos hechos
 * distintos, y meterlos en el mismo botón hace que el segundo desaparezca. Un
 * error que nadie puede cerrar y que no tiene forma de decirlo se cierra
 * mintiendo o se queda abierto para siempre — y las dos opciones rompen el
 * tablero.
 *
 * Va con la sesión de quien lo declara: `canal_error_no_se_puede` guarda
 * `auth.uid()` y mira el rol adentro.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  let body: { anomalia_id?: string; motivo?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  if (!body.anomalia_id || !body.motivo?.trim()) {
    return NextResponse.json({ error: 'faltan el hallazgo o el motivo' }, { status: 400 })
  }

  const { data, error } = await sb.rpc('canal_error_no_se_puede', {
    p_anomalia: body.anomalia_id,
    p_motivo: body.motivo,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as { ok: boolean; por_que?: string }
  if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo' }, { status: 400 })
  return NextResponse.json(r)
}
