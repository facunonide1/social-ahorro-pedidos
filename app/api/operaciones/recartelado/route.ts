import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

/**
 * POST:
 *  - { accion: 'generar_tareas', lista_id } → UNA tarea por sucursal con la lista
 *    de carteles a cambiar (evidencia foto + verificable). Idempotente.
 *  - { accion: 'marcar', lista_id | item_id, estado } → pendiente | hecho.
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'generar_tareas') {
    if (!b?.lista_id) return NextResponse.json({ error: 'lista requerida' }, { status: 400 })
    const { data: lista } = await adm.from('listas_recartelado').select('id, sucursal_id, tarea_id, fecha').eq('id', b.lista_id).maybeSingle<any>()
    if (!lista) return NextResponse.json({ error: 'lista no encontrada' }, { status: 404 })
    if (lista.tarea_id) return NextResponse.json({ ok: true, ya: true, tarea_id: lista.tarea_id })
    const { data: items } = await adm.from('recartelado_items').select('nombre, sku, precio_viejo, precio_nuevo').eq('lista_id', lista.id)
    const detalle = ((items ?? []) as any[]).slice(0, 60).map((i) => `• ${i.nombre} (${i.sku ?? '—'}): $${i.precio_viejo} → $${i.precio_nuevo}`).join('\n')
    const { data: tarea } = await adm.from('tareas').insert({
      titulo: `Recartelar ${((items ?? []).length)} precios (${lista.fecha})`,
      descripcion: `Cambiá los carteles de góndola de estos productos y sacá una foto al terminar:\n${detalle}`,
      tipo_origen: 'auto_sistema', prioridad: 'media', estado: 'pendiente', verificacion_humana: true,
      sucursal_id: lista.sucursal_id, entidad_relacionada: 'recartelado', entidad_id: lista.id, creado_por: g.userId,
    }).select('id').single()
    if (tarea?.id) await adm.from('listas_recartelado').update({ tarea_id: tarea.id }).eq('id', lista.id)
    return NextResponse.json({ ok: true, tarea_id: tarea?.id })
  }

  if (b?.accion === 'marcar') {
    const estado = b?.estado === 'hecho' ? 'hecho' : 'pendiente'
    if (b?.item_id) await adm.from('recartelado_items').update({ estado }).eq('id', b.item_id)
    else if (b?.lista_id) await adm.from('listas_recartelado').update({ estado }).eq('id', b.lista_id)
    else return NextResponse.json({ error: 'faltó id' }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
