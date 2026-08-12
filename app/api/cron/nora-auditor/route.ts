import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { correrAuditor } from '@/lib/ai/auditor'
import { automatizacionActiva } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Cron diario: el auditor proactivo de NORA revisa el negocio y emite avisos. */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  // La declaración de la fábrica puede apagarla. Fallback `true`: lo que hace el
  // código. Un cron que corre de más se nota; uno que no corre, no.
  if (!(await automatizacionActiva('inteligencia', 'auditar_acciones', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  try {
    const r = await correrAuditor(createAdminClient())
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
