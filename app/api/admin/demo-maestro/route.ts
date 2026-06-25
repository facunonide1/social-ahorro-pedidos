import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function gateSuper() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || me.rol !== 'super_admin') return { error: 'requiere super_admin', status: 403 as const }
  return { ok: true as const }
}

/**
 * POST:
 *  - { accion: 'contar' }   → cuántos registros demo hay
 *  - { accion: 'cargar' }   → corre el seed maestro
 *  - { accion: 'limpiar', confirmacion: 'CONFIRMAR' } → borra SOLO es_demo
 */
export async function POST(req: NextRequest) {
  const g = await gateSuper()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'contar') {
    const { data, error } = await adm.rpc('contar_demo')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, conteo: data })
  }
  if (b?.accion === 'cargar') {
    const { data, error } = await adm.rpc('seed_demo_maestro')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    try { await adm.rpc('seed_irregularidades_demo') } catch { /* irregularidades best-effort */ }
    return NextResponse.json({ ok: true, resultado: data })
  }
  if (b?.accion === 'limpiar') {
    if (b?.confirmacion !== 'CONFIRMAR') return NextResponse.json({ error: 'Escribí CONFIRMAR para limpiar el demo' }, { status: 400 })
    const { data, error } = await adm.rpc('limpiar_demo')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, resultado: data })
  }
  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
