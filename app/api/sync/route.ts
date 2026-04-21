import { NextResponse, type NextRequest } from 'next/server'
import { syncFromWoo } from '@/lib/woo/sync'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/sync
 *   - desde la UI: usuario autenticado con rol admin/operador
 *   - desde el cron de Vercel: header x-sync-secret == SYNC_CRON_SECRET
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.SYNC_CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  const fromCron = !!cronSecret && (
    req.headers.get('x-sync-secret') === cronSecret ||
    authHeader === `Bearer ${cronSecret}`
  )

  if (!fromCron) {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

    const { data: profile } = await sb
      .from('users_pedidos')
      .select('role, active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
      return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
    }
  }

  try {
    const result = await syncFromWoo({ perPage: 50, pages: 2 })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'error_desconocido' },
      { status: 500 }
    )
  }
}

/** GET para que el cron de Vercel lo llame sin body. */
export async function GET(req: NextRequest) {
  return POST(req)
}
