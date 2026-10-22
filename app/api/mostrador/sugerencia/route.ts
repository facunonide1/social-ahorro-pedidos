import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * E.4 · UNA SOLA SUGERENCIA, Y QUE APRENDA.
 *
 * Pedir la sugerencia la registra como ofrecida; el empleado después dice si
 * se aceptó o no. Lo que no se contesta queda en null y **no cuenta como
 * rechazo**: una regla no se apaga porque nadie haya tocado el botón.
 *
 * ── NO ES CLÍNICA ──────────────────────────────────────────────────────────
 *
 * Es una regla comercial: «quien lleva A suele llevar B». Una regla que
 * sugiriera un producto con receta a partir de otra compra sería indicar un
 * tratamiento, y la base la rechaza con un trigger (migración 0225).
 */

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) {
    return { error: 'sin permiso', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const b = await req.json().catch(() => null)
  const adm = createAdminClient()
  const sucursal = g.sucursalId ?? b?.sucursal_id ?? null

  if (String(b?.accion ?? 'pedir') === 'pedir') {
    if (!b?.producto_id || !sucursal) {
      return NextResponse.json({ error: 'falta el producto o la sucursal' }, { status: 400 })
    }
    const { data, error } = await adm.rpc('mostrador_sugerencia', {
      p_producto: b.producto_id, p_sucursal: sucursal,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const r = data as any
    if (!r?.hay) return NextResponse.json(r)

    // Queda registrada como ofrecida, con `aceptada` en null: todavía nadie
    // contestó.
    const { data: log } = await adm.from('mostrador_sugerencias_log').insert({
      regla_id: r.regla_id, sugerido_producto_id: r.producto_id,
      sucursal_id: sucursal, ofrecido_por: g.userId, aceptada: null,
    }).select('id').maybeSingle()

    return NextResponse.json({ ...r, log_id: log?.id ?? null })
  }

  // El empleado dice qué pasó.
  if (b?.accion === 'responder') {
    if (!b?.log_id || typeof b?.aceptada !== 'boolean') {
      return NextResponse.json({ error: 'falta el log o la respuesta' }, { status: 400 })
    }
    const { error } = await adm.from('mostrador_sugerencias_log')
      .update({ aceptada: b.aceptada }).eq('id', b.log_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
