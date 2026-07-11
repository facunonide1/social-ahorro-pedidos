import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { subAppsVisibles, type BadgeResult } from '@/lib/os/subapps'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * NORA OS · badges vivos del dock. Calcula, SOLO para las sub-apps que el usuario
 * ve, el contador barato definido en cada manifest. Devuelve { [subappId]: {count,
 * severidad} }. Tolerante a fallos (una tabla que no exista o RLS que bloquee →
 * esa sub-app queda sin badge). No inventa contadores.
 */
export async function GET() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({})

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo, permisos_custom')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({})

  const visibles = subAppsVisibles(me.rol, me.permisos_custom ?? null)
  const out: Record<string, BadgeResult> = {}

  await Promise.all(
    visibles.map(async (app) => {
      if (!app.badge) return
      try {
        out[app.id] = await app.badge(sb as any, user.id, me.rol)
      } catch {
        out[app.id] = null
      }
    }),
  )

  return NextResponse.json(out)
}
