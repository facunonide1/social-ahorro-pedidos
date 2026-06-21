import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'
import { revertir } from '@/lib/centro-datos/import'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** POST { job_id }: deshace una importación aplicada restaurando el snapshot. */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!b?.job_id) return NextResponse.json({ error: 'job_id requerido' }, { status: 400 })
  const adm = createAdminClient()
  try {
    await revertir(adm, b.job_id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudo revertir' }, { status: 400 })
  }
}
