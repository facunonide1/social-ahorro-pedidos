import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reclamar una tarea de pool — "La hago yo" (F6-T · T5).
 *
 * Reclamo ATÓMICO: el UPDATE condiciona a reclamada_por IS NULL, así que si
 * dos personas la reclaman a la vez, solo una afecta filas; la otra recibe 409
 * con el nombre de quien la tomó.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin')
    .select('activo')
    .eq('id', user.id)
    .maybeSingle<{ activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })

  const adm = createAdminClient()
  const nowIso = new Date().toISOString()

  // Update atómico: solo afecta si nadie la reclamó todavía.
  const { data, error } = await adm
    .from('tareas')
    .update({
      responsable_id: user.id,
      reclamada_por: user.id,
      reclamada_at: nowIso,
      estado: 'reclamada',
    })
    .eq('id', params.id)
    .is('reclamada_por', null)
    .is('responsable_id', null)
    .in('asignacion_tipo', ['pool_turno', 'pool_sucursal'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (!data || data.length === 0) {
    // Ya la tomó alguien (o no es de pool). Buscamos quién.
    const { data: actual } = await adm
      .from('tareas')
      .select('reclamada_por, responsable_id')
      .eq('id', params.id)
      .maybeSingle<{ reclamada_por: string | null; responsable_id: string | null }>()
    let nombre = 'otra persona'
    const quien = actual?.reclamada_por || actual?.responsable_id
    if (quien) {
      try {
        const { data: au } = await adm.auth.admin.getUserById(quien)
        nombre = ((au?.user?.user_metadata as any)?.nombre as string) || au?.user?.email || nombre
      } catch { /* noop */ }
    }
    return NextResponse.json({ error: `Ya la tomó ${nombre}.`, taken_by: nombre }, { status: 409 })
  }

  // Historial
  await adm.from('tareas_historial').insert({
    tarea_id: params.id,
    user_id: user.id,
    accion: 'asignada',
    estado_nuevo: 'reclamada',
  })

  return NextResponse.json({ ok: true })
}
