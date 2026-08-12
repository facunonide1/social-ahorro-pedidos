import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { automatizacionActiva } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Cron diario: genera los controles de zona cuyo dia_control cae hoy. */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  // La declaración de la fábrica puede apagarla. Fallback `true`: lo que hace el
  // código. Un cron que corre de más se nota; uno que no corre, no.
  if (!(await automatizacionActiva('stock', 'generar_controles_de_zona', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  const dow = ((new Date().getDay() + 6) % 7) + 1 // 1=lun .. 7=dom
  try {
    const { data, error } = await createAdminClient().rpc('generar_controles_zona', { p_dia: dow })
    if (error) throw error
    return NextResponse.json({ ok: true, dia: dow, ...data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
