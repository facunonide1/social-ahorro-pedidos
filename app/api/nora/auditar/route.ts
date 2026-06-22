import { NextResponse } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { correrAuditor } from '@/lib/ai/auditor'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** POST: corre el auditor proactivo ahora (botón "Revisar ahora"). */
export async function POST() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !['super_admin', 'gerente', 'auditor', 'tesoreria', 'administrativo'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }
  const r = await correrAuditor(createAdminClient())
  return NextResponse.json({ ok: true, ...r })
}
