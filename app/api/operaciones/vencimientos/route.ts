import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor']

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
 *  - { accion: 'cargar', items: [{ producto_id, sku, sucursal_id, fecha_vencimiento, cantidad, ubicacion }] }
 *  - { accion: 'resolver', id, resolucion, nota?, producto?, sucursal_id? } → marca resuelto; reponer/tarea crean tarea
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'cargar') {
    const items = (Array.isArray(b?.items) ? b.items : []).filter((i: any) => i.sucursal_id && i.fecha_vencimiento && Number(i.cantidad) > 0)
    if (!items.length) return NextResponse.json({ error: 'cargá al menos un producto con fecha y cantidad' }, { status: 400 })
    const { error } = await adm.from('vencimientos').insert(items.map((i: any) => ({
      producto_id: i.producto_id ?? null, sku: i.sku ?? null, sucursal_id: i.sucursal_id,
      fecha_vencimiento: i.fecha_vencimiento, cantidad: Number(i.cantidad),
      ubicacion: i.ubicacion === 'deposito' ? 'deposito' : 'gondola', created_by: g.userId,
    })))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, cargados: items.length })
  }

  if (b?.accion === 'resolver') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const res = String(b?.resolucion ?? 'baja')
    await adm.from('vencimientos').update({ estado: 'resuelto', resolucion: res, nota: b?.nota ?? null, resuelto_at: new Date().toISOString() }).eq('id', b.id)
    // reponer / tarea → genera una tarea operativa
    if ((res === 'reponer' || res === 'tarea') && b?.producto && b?.sucursal_id) {
      await adm.from('tareas').insert({
        titulo: res === 'reponer' ? `Reponer góndola: ${b.producto}` : `Control vencimiento: ${b.producto}`,
        descripcion: b?.nota ?? 'Generada desde Vencimientos por NORA.',
        tipo_origen: 'auto_sistema', prioridad: 'alta', estado: 'pendiente',
        sucursal_id: b.sucursal_id, entidad_relacionada: 'vencimiento', entidad_id: b.id,
        creado_por: g.userId,
      })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
