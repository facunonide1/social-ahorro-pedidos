import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateGestion } from '../route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CAMPOS = [
  'titulo_plantilla', 'descripcion_plantilla', 'patron', 'dias_semana',
  'dia_mes', 'hora_limite', 'sucursal_id', 'asignacion_tipo', 'turno_id',
  'usuario_fijo_id', 'activa',
] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateGestion()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const patch: Record<string, unknown> = {}
  for (const k of CAMPOS) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada para actualizar' }, { status: 400 })
  }

  const adm = createAdminClient()
  const { error } = await adm.from('tareas_recurrencias').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateGestion()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()
  const { error } = await adm.from('tareas_recurrencias').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
