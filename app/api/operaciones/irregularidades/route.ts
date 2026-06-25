import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Dato sensible (pérdidas): solo roles autorizados.
const ROLES: AdminRole[] = ['super_admin', 'gerente', 'auditor', 'administrativo', 'tesoreria']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return { error: 'No tenés acceso al control de pérdidas.', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

/**
 * POST:
 *  - { accion: 'marcar', ids[], estado: 'revisada'|'justificada', nota? }
 *  - { accion: 'recalcular', sucursal_id, fecha }
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'marcar') {
    const ids: string[] = Array.isArray(b?.ids) ? b.ids : []
    if (!ids.length || !['revisada', 'justificada'].includes(b?.estado)) return NextResponse.json({ error: 'faltan datos' }, { status: 400 })
    const { error } = await adm.from('irregularidades_stock')
      .update({ estado: b.estado, nota: b?.nota ?? null, revisada_por: g.userId, revisada_at: new Date().toISOString() })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, actualizadas: ids.length })
  }

  if (b?.accion === 'recalcular') {
    if (!b?.sucursal_id || !b?.fecha) return NextResponse.json({ error: 'sucursal y fecha requeridas' }, { status: 400 })
    const { data, error } = await adm.rpc('calcular_irregularidades_stock', { p_sucursal: b.sucursal_id, p_fecha: b.fecha })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, resultado: data })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
