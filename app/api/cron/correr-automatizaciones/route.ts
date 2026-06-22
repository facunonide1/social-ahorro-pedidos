import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { correrAutomatizaciones } from '@/lib/crm/automatizaciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Cron diario: evalúa las automatizaciones del CRM y genera los envíos. */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const adm = createAdminClient()
  try {
    const r = await correrAutomatizaciones(adm)
    return NextResponse.json({ ok: true, resultado: r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
