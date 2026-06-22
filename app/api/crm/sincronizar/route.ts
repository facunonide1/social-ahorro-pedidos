import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'
import { sincronizarFuentes } from '@/lib/crm/unificar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** POST: sincroniza las fuentes reales (cuponera/pedidos/tickets) → maestro clientes. */
export async function POST() {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  try {
    const r = await sincronizarFuentes(adm)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error al sincronizar' }, { status: 400 })
  }
}
