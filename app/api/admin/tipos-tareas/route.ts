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

function pick(body: any) {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_EDITABLES) if (k in body) out[k] = body[k]
  return out
}

/** Alta de tipo de tarea (F6-T · T3). */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const codigo = String(body?.codigo ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  if (!codigo) return NextResponse.json({ error: 'código requerido' }, { status: 400 })
  if (!String(body?.nombre ?? '').trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const adm = createAdminClient()
  const { data, error } = await adm
    .from('tipos_tareas')
    .insert({ codigo, ...pick(body) })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    const msg = error.message.includes('duplicate') ? 'Ya existe un tipo con ese código.' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id: data?.id })
}
