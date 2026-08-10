import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { parametro } from '@/lib/os/definicion'
import { subAppsVisibles, type BadgeResult, type ParamsDeBadge } from '@/lib/os/subapps'
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

  // Los parámetros que usan los badges se resuelven UNA vez acá y se pasan.
  // Puede venir de la declaración de la fábrica; si el lector está apagado o
  // algo falla, devuelve estos mismos 30 días y el badge no cambia.
  const params: ParamsDeBadge = {
    diasAvisoVencimiento: await parametro('stock', 'dias_aviso_vencimiento', 30),
  }

  await Promise.all(
    visibles.map(async (app) => {
      if (!app.badge) return
      try {
        out[app.id] = await app.badge(sb as any, user.id, me.rol, params)
      } catch {
        out[app.id] = null
      }
    }),
  )

  return NextResponse.json(out)
}
