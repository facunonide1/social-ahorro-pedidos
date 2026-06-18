import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { analizarVencimientos, confirmarVencimientos, type FilaVenc, type ItemVencAnalizado } from '@/lib/inventario/procesar-vencimientos-import'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador'].includes(me.rol)) {
    return { error: 'requiere super_admin / gerente / comprador', status: 403 as const }
  }
  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (body?.accion === 'analizar') {
    const filas = (body?.filas ?? []) as FilaVenc[]
    if (filas.length === 0) return NextResponse.json({ error: 'filas requeridas' }, { status: 400 })
    const items = await analizarVencimientos(adm, filas)
    return NextResponse.json({ ok: true, items })
  }
  if (body?.accion === 'confirmar') {
    const sucursalId = String(body?.sucursalId ?? '')
    const items = (body?.items ?? []) as ItemVencAnalizado[]
    if (!sucursalId || items.length === 0) return NextResponse.json({ error: 'datos incompletos' }, { status: 400 })
    try {
      const res = await confirmarVencimientos(adm, { sucursalId, items })
      return NextResponse.json({ ok: true, ...res })
    } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'error' }, { status: 400 }) }
  }
  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
