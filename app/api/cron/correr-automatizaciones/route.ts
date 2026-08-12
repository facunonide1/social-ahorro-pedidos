import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { correrAutomatizaciones } from '@/lib/crm/automatizaciones'
import { automatizacionActiva } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Cron diario: evalúa las automatizaciones del CRM y genera los envíos. */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  // La declaración de la fábrica puede apagarla. Fallback `true`: lo que hace el
  // código. Un cron que corre de más se nota; uno que no corre, no.
  if (!(await automatizacionActiva('clientes', 'correr_automatizaciones', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  const adm = createAdminClient()
  try {
    const r = await correrAutomatizaciones(adm)
    return NextResponse.json({ ok: true, resultado: r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
