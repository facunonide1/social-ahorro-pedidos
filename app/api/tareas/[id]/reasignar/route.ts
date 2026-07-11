import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reasignar responsable de una tarea (OS-2a · E · kanban).
 * body: { responsable_id: uuid | null }
 * Permiso: gerencia o supervisor de la sucursal de la tarea.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const responsableId = typeof body?.responsable_id === 'string' ? body.responsable_id : null

  const adm = createAdminClient()
  const { data: tarea } = await adm
    .from('tareas').select('id, titulo, estado, sucursal_id, responsable_id').eq('id', params.id)
    .maybeSingle<any>()
  if (!tarea) return NextResponse.json({ error: 'tarea no encontrada' }, { status: 404 })

  const gerencia = me.rol === 'super_admin' || me.rol === 'gerente'
  let permitido = gerencia
  if (!permitido && tarea.sucursal_id) {
    const { data: sup } = await adm
      .from('supervisores_tareas').select('id')
      .eq('sucursal_id', tarea.sucursal_id).eq('user_id', user.id).eq('activo', true)
      .maybeSingle()
    permitido = Boolean(sup)
  }
  if (!permitido) return NextResponse.json({ error: 'requiere supervisor o gerencia' }, { status: 403 })

  const patch: Record<string, unknown> = {
    responsable_id: responsableId,
    fecha_asignacion: responsableId ? new Date().toISOString() : null,
  }
  // Si estaba sin arrancar y se le asigna dueño, pasa a "asignada".
  if (responsableId && ['pendiente', 'reclamada'].includes(tarea.estado)) patch.estado = 'asignada'

  const { error } = await adm.from('tareas').update(patch).eq('id', tarea.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adm.from('tareas_historial').insert({
    tarea_id: tarea.id, user_id: user.id, accion: 'reasignada',
    estado_anterior: tarea.responsable_id, estado_nuevo: responsableId,
  })

  if (responsableId && responsableId !== tarea.responsable_id) {
    await adm.from('notificaciones_admin').insert({
      user_id: responsableId, tipo: 'tarea', prioridad: 'media',
      titulo: 'Tarea asignada', mensaje: `Te asignaron: ${tarea.titulo}`,
      url_accion: `/admin/tareas/${tarea.id}`,
    })
  }

  return NextResponse.json({ ok: true })
}
