import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Postea los recordatorios programados vencidos y reprograma (Comunicación · T8). */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  const adm = createAdminClient()
  const ahora = new Date()
  const { data: recs } = await adm.from('recordatorios_programados').select('*').eq('activo', true).lte('proxima_ejecucion', ahora.toISOString()).limit(200)
  let posteados = 0
  for (const r of (recs ?? []) as any[]) {
    await adm.from('mensajes').insert({ canal_id: r.canal_id, autor_user_id: null, tipo: 'sistema', contenido: `⏰ Recordatorio: ${r.contenido}` })
    posteados++
    let prox: Date | null = null
    if (r.patron === 'diario') prox = new Date(ahora.getTime() + 86_400_000)
    else if (r.patron === 'semanal') prox = new Date(ahora.getTime() + 7 * 86_400_000)
    if (prox) await adm.from('recordatorios_programados').update({ proxima_ejecucion: prox.toISOString() }).eq('id', r.id)
    else await adm.from('recordatorios_programados').update({ activo: false }).eq('id', r.id)
  }
  return NextResponse.json({ ok: true, posteados })
}
