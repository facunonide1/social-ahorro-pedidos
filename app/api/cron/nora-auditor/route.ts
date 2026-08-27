import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { correrAuditor } from '@/lib/ai/auditor'
import { automatizacionActiva } from '@/lib/os/definicion'
import { puedeCalcular } from '@/lib/demo/guarda-calculo'

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

  // Y aunque esté encendida, no calcula sobre datos de demostración: el número
  // que produce se GUARDA, y un histórico falso no se nota después (v0.81).
  // La condición se evalúa acá y no en run(): el POST de abajo es una persona
  // apretando un botón, y eso ya es una decisión tomada.
  const g = await puedeCalcular('nora-auditor')
  if (!g.puede) return NextResponse.json({ ok: true, omitida: g.motivo })
  try {
    const r = await correrAuditor(createAdminClient())
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
