import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST { accion: 'aprobar'|'descartar'|'resolver', id } — gestiona un aviso del feed. */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const estado = b.accion === 'aprobar' ? 'aprobado' : b.accion === 'resolver' ? 'resuelto' : 'descartado'

  const adm = createAdminClient()
  const { error } = await adm.from('nora_avisos').update({ estado, resuelto_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
