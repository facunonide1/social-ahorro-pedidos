import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Lista los pedidos creados después del timestamp `t` (ISO).
 * Lo usa el dashboard para detectar pedidos nuevos mientras está
 * abierto y disparar una notificación sonora.
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()

  if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const t = req.nextUrl.searchParams.get('t')
  if (!t) return NextResponse.json({ error: 't_requerido' }, { status: 400 })

  const since = new Date(t)
  if (isNaN(since.getTime())) return NextResponse.json({ error: 't_invalido' }, { status: 400 })

  const { data, count, error } = await sb
    .from('orders')
    .select('id, codigo, customer_name, tipo_envio, origin, created_at', { count: 'exact' })
    .gt('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    count: count ?? 0,
    items: data ?? [],
  })
}
