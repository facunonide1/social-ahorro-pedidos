import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Descarga completa de la base operativa en JSON. Sólo admin.
 * Los datos de Supabase Auth (contraseñas) NO se exportan acá: el
 * backup queda restaurable si tenés los usuarios en auth.users.
 */
export async function GET(_req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()
  if (!profile?.active || profile.role !== 'admin') {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const admin = createAdminClient()

  const tables = [
    'users_pedidos', 'zonas_reparto', 'customers', 'orders',
    'order_status_history', 'whatsapp_messages', 'order_incidents',
    'app_settings',
  ] as const

  const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), tables: {} as Record<string, unknown> }
  for (const t of tables) {
    const { data, error } = await admin.from(t).select('*').limit(100000)
    ;(dump.tables as any)[t] = error ? { error: error.message } : (data ?? [])
  }

  const body = JSON.stringify(dump, null, 2)
  const filename = `sa-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
