import { NextResponse, type NextRequest } from 'next/server'

import { isCronRequest } from '@/lib/cron/auth'
import { rematchearCompras } from '@/lib/drive/rematch'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  const cursor = req.nextUrl.searchParams.get('cursor')
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }
  try {
    const r = await rematchearCompras(createAdminClient(), { cursor })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : 'falló el rematch'
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
