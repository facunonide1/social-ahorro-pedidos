import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function gateGestion() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return { error: 'requiere super_admin o gerente', status: 403 as const, userId: '' }
  }
  return { ok: true as const, userId: user.id }
}

const CAMPOS = [
  'tipo_tarea_id', 'titulo_plantilla', 'descripcion_plantilla', 'patron',
  'dias_semana', 'dia_mes', 'hora_limite', 'sucursal_id', 'asignacion_tipo',
  'turno_id', 'usuario_fijo_id', 'activa',
] as const

function pick(body: any) {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS) if (k in body) out[k] = body[k]
  return out
}

/** Alta de recurrencia (F6-T · T4). */
export async function POST(req: NextRequest) {
  const g = await gateGestion()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!body?.tipo_tarea_id) return NextResponse.json({ error: 'tipo requerido' }, { status: 400 })
  if (!body?.sucursal_id) return NextResponse.json({ error: 'sucursal requerida' }, { status: 400 })

  const adm = createAdminClient()
  const { data, error } = await adm
    .from('tareas_recurrencias')
    .insert({ ...pick(body), activa: body.activa ?? true, created_by: g.userId })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data?.id })
}
