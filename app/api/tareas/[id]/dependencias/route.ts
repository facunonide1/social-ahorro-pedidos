import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Alta/baja de dependencias entre tareas (OS-2a · Entregable D).
 * body: { add?: uuid, remove?: uuid }
 *
 * Permiso: creador de la tarea, supervisor de su sucursal, o gerencia.
 * Bloquea auto-referencia y ciclos (BFS acotado sobre dependencias_ids).
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
  const add = typeof body?.add === 'string' ? body.add : null
  const remove = typeof body?.remove === 'string' ? body.remove : null
  if (!add && !remove) return NextResponse.json({ error: 'nada para hacer' }, { status: 400 })

  const adm = createAdminClient()
  const { data: tarea } = await adm
    .from('tareas').select('id, dependencias_ids, sucursal_id, creado_por').eq('id', params.id)
    .maybeSingle<any>()
  if (!tarea) return NextResponse.json({ error: 'tarea no encontrada' }, { status: 404 })

  // Permiso
  const gerencia = me.rol === 'super_admin' || me.rol === 'gerente'
  let permitido = gerencia || tarea.creado_por === user.id
  if (!permitido && tarea.sucursal_id) {
    const { data: sup } = await adm
      .from('supervisores_tareas').select('id')
      .eq('sucursal_id', tarea.sucursal_id).eq('user_id', user.id).eq('activo', true)
      .maybeSingle()
    permitido = Boolean(sup)
  }
  if (!permitido) return NextResponse.json({ error: 'sin permiso para editar dependencias' }, { status: 403 })

  const actuales: string[] = Array.isArray(tarea.dependencias_ids) ? tarea.dependencias_ids : []
  let next = actuales

  if (remove) {
    next = actuales.filter((x) => x !== remove)
  }

  if (add) {
    if (add === tarea.id) return NextResponse.json({ error: 'una tarea no puede depender de sí misma' }, { status: 400 })
    // La dependencia debe existir
    const { data: dep } = await adm.from('tareas').select('id').eq('id', add).maybeSingle()
    if (!dep) return NextResponse.json({ error: 'la tarea dependencia no existe' }, { status: 400 })
    // Anti-ciclo: si `add` (transitivamente) ya depende de esta tarea, rechazar.
    if (await creaCiclo(adm, add, tarea.id)) {
      return NextResponse.json({ error: 'eso crearía una dependencia circular' }, { status: 400 })
    }
    if (!next.includes(add)) next = [...next, add]
  }

  const { error } = await adm.from('tareas').update({ dependencias_ids: next }).eq('id', tarea.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adm.from('tareas_historial').insert({
    tarea_id: tarea.id, user_id: user.id, accion: 'dependencia',
    estado_nuevo: add ? 'agregada' : 'quitada',
  })

  return NextResponse.json({ ok: true, dependencias_ids: next })
}

/** ¿Agregar `startId` como dependencia terminaría alcanzando `targetId`? (ciclo). */
async function creaCiclo(adm: any, startId: string, targetId: string): Promise<boolean> {
  const visto = new Set<string>()
  let frontera = [startId]
  let saltos = 0
  while (frontera.length && saltos < 50) {
    saltos++
    const { data } = await adm.from('tareas').select('id, dependencias_ids').in('id', frontera)
    const siguiente: string[] = []
    for (const t of (data ?? []) as any[]) {
      for (const d of (Array.isArray(t.dependencias_ids) ? t.dependencias_ids : [])) {
        if (d === targetId) return true
        if (!visto.has(d)) { visto.add(d); siguiente.push(d) }
      }
    }
    frontera = siguiente
  }
  return false
}
