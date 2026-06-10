import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return { error: 'requiere super_admin o gerente', status: 403 as const }
  }
  return { ok: true as const }
}

const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'categoria', 'icono', 'color', 'prioridad_default',
  'sla_horas', 'verificacion_humana', 'verificacion_ia', 'ia_prompt_verificacion',
  'evidencia_requerida', 'checklist_items', 'puntos_completar', 'plantilla_titulo',
  'plantilla_descripcion', 'alcance', 'sucursales_ids', 'permite_recurrencia',
  'es_auto_generable', 'activo',
] as const

/** Edición de tipo de tarea (F6-T · T3). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  for (const k of CAMPOS_EDITABLES) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada para actualizar' }, { status: 400 })
  }

  const adm = createAdminClient()
  const { error } = await adm.from('tipos_tareas').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
