import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate(roles: AdminRole[]) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !roles.includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id, rol: me.rol }
}

/** Crear aviso de faltante (1 tap desde sucursal) o resolver/descartar. */
export async function POST(req: NextRequest) {
  const g = await gate(['super_admin', 'gerente', 'comprador', 'sucursal', 'administrativo'])
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  // Acciones de gestión (comprador/gerente/super)
  if (b?.action) {
    if (!['super_admin', 'gerente', 'comprador'].includes(g.rol)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    const ids: string[] = Array.isArray(b.ids) ? b.ids : b.id ? [b.id] : []
    if (!ids.length) return NextResponse.json({ error: 'ids requeridos' }, { status: 400 })
    const estado = b.action === 'resolver' ? 'resuelto' : b.action === 'descartar' ? 'descartado' : null
    if (!estado) return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
    const { error } = await adm.from('avisos_faltante').update({ estado }).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, actualizados: ids.length })
  }

  // Crear aviso
  const producto_id = b?.producto_id || null
  const texto_libre = (b?.texto_libre ?? '').trim() || null
  const sucursal_id = b?.sucursal_id || null
  if (!producto_id && !texto_libre) return NextResponse.json({ error: 'elegí un producto o describí el faltante' }, { status: 400 })
  if (!sucursal_id) return NextResponse.json({ error: 'sucursal requerida' }, { status: 400 })

  const { data, error } = await adm.from('avisos_faltante').insert({
    producto_id, texto_libre, sucursal_id,
    rubro: b?.rubro ?? null,
    cantidad_sugerida: b?.cantidad_sugerida != null ? Number(b.cantidad_sugerida) : null,
    foto_url: b?.foto_url ?? null,
    reportado_por: g.userId,
    estado: 'nuevo',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Notificar a Compras
  const { data: compradores } = await adm.from('users_admin').select('id').eq('activo', true).in('rol', ['super_admin', 'gerente', 'comprador'])
  if (compradores?.length) {
    await adm.from('notificaciones_admin').insert(compradores.map((c: any) => ({
      user_id: c.id, tipo: 'alerta', prioridad: 'media',
      titulo: 'Nuevo faltante reportado', mensaje: texto_libre || 'Producto del catálogo', url_accion: '/admin/compras/faltantes',
    })))
  }
  return NextResponse.json({ ok: true, id: data.id })
}
