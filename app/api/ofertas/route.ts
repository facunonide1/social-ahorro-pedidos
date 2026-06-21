import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { aprobarOferta } from '@/lib/ofertas/al-aprobar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id, rol: me.rol, permisosCustom: me.permisos_custom ?? {} }
}

const CAMPOS = ['campania_id', 'nombre', 'tipo', 'valor', 'nx', 'ny', 'combo_detalle', 'tramos', 'productos_ids', 'rubro', 'canales', 'vigencia_tipo', 'fecha_inicio', 'fecha_fin', 'origen', 'origen_ref', 'limite_unidades_total', 'limite_por_cliente', 'tope_inversion', 'b2b', 'propuesta_por', 'justificacion'] as const

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion ?? 'crear'
  const puedeGestionar = puede(g.rol, g.permisosCustom, 'ofertas', 'editar') || puede(g.rol, g.permisosCustom, 'ofertas', 'crear')

  // ---- confirmar lectura (cualquier empleado activo) ----
  if (accion === 'confirmar_lectura') {
    if (!b?.oferta_id) return NextResponse.json({ error: 'oferta requerida' }, { status: 400 })
    const { data: of } = await adm.from('ofertas').select('version').eq('id', b.oferta_id).maybeSingle()
    await adm.from('ofertas_confirmaciones').upsert({ oferta_id: b.oferta_id, empleado_user_id: g.userId, version_confirmada: of?.version ?? 1, confirmada_at: new Date().toISOString() }, { onConflict: 'oferta_id,empleado_user_id' })
    return NextResponse.json({ ok: true })
  }

  if (!puedeGestionar) return NextResponse.json({ error: 'sin permiso para gestionar ofertas' }, { status: 403 })

  // ---- crear campaña ----
  if (accion === 'crear_campania') {
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data, error } = await adm.from('campanias').insert({
      nombre: b.nombre, descripcion: b?.descripcion ?? null, objetivo: b?.objetivo ?? null,
      tipo_origen: b?.tipo_origen ?? 'campania_fecha', fecha_inicio: b?.fecha_inicio ?? null, fecha_fin: b?.fecha_fin ?? null,
      estado: b?.estado ?? 'activa', created_by: g.userId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  // ---- alta de producto al catálogo ----
  if (accion === 'alta_producto') {
    const nombre = String(b?.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data, error } = await adm.from('productos_catalogo').insert({ nombre, sku: b?.sku ?? null, codigo_barras: b?.ean ?? null, activo: true }).select('id, sku, nombre').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, producto: data })
  }

  const pick = () => Object.fromEntries(CAMPOS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]))

  // ---- crear ----
  if (accion === 'crear') {
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data, error } = await adm.from('ofertas').insert({ ...pick(), estado: 'borrador', created_by: g.userId }).select('id, codigo').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, codigo: data.codigo })
  }

  if (!b?.id && accion !== 'crear') return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // ---- editar (oferta viva) ----
  if (accion === 'editar') {
    const { data: of } = await adm.from('ofertas').select('*').eq('id', b.id).maybeSingle()
    if (!of) return NextResponse.json({ error: 'oferta inexistente' }, { status: 404 })
    const activa = ['aprobada', 'activa', 'pausada'].includes(of.estado)
    const patch: any = { ...pick(), updated_at: new Date().toISOString() }
    if (activa) {
      const nuevaVersion = (of.version ?? 1) + 1
      patch.version = nuevaVersion
      await adm.from('ofertas_versiones').insert({ oferta_id: of.id, version: nuevaVersion, snapshot: { ...of, ...patch }, cambiado_por: g.userId })
      // resetear confirmaciones: pasan a pendientes (version_confirmada 0) + re-notificar
      await adm.from('ofertas_confirmaciones').update({ version_confirmada: 0 }).eq('oferta_id', of.id)
      const { data: emp } = await adm.from('users_admin').select('id').eq('activo', true)
      if (emp?.length) await adm.from('notificaciones_admin').insert((emp as any[]).map((e) => ({ user_id: e.id, tipo: 'info', prioridad: 'media', titulo: `Oferta actualizada: ${patch.nombre ?? of.nombre}`, mensaje: 'Cambió — confirmá que viste la nueva versión.', url_accion: '/admin/ofertas/panel' })))
    }
    const { error } = await adm.from('ofertas').update(patch).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, version: patch.version ?? of.version })
  }

  // ---- enviar a aprobación ----
  if (accion === 'enviar_aprobacion') {
    await adm.from('ofertas').update({ estado: 'pendiente_aprobacion', updated_at: new Date().toISOString() }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  // ---- aprobar (dispara el motor) ----
  if (accion === 'aprobar') {
    if (!puede(g.rol, g.permisosCustom, 'ofertas', 'aprobar')) return NextResponse.json({ error: 'sin permiso para aprobar ofertas (ofertas:aprobar)' }, { status: 403 })
    try { const r = await aprobarOferta(adm, b.id, g.userId); return NextResponse.json(r) }
    catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Error al aprobar' }, { status: 400 }) }
  }

  // ---- rechazar ----
  if (accion === 'rechazar') {
    if (!puede(g.rol, g.permisosCustom, 'ofertas', 'aprobar')) return NextResponse.json({ error: 'sin permiso (ofertas:aprobar)' }, { status: 403 })
    await adm.from('ofertas').update({ estado: 'rechazada', rechazo_motivo: b?.motivo ?? null, updated_at: new Date().toISOString() }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  // ---- pausar / finalizar / reactivar ----
  if (accion === 'estado') {
    if (!['pausada', 'finalizada', 'activa'].includes(b?.estado)) return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
    await adm.from('ofertas').update({ estado: b.estado, updated_at: new Date().toISOString() }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  // ---- recordar lectura a los que faltan ----
  if (accion === 'recordar') {
    const { data: pend } = await adm.from('ofertas_confirmaciones').select('empleado_user_id').eq('oferta_id', b.id).eq('version_confirmada', 0)
    if (pend?.length) await adm.from('notificaciones_admin').insert((pend as any[]).map((p) => ({ user_id: p.empleado_user_id, tipo: 'recordatorio', prioridad: 'media', titulo: 'Recordá confirmar la oferta', mensaje: 'Te falta confirmar que viste una oferta activa.', url_accion: '/admin/ofertas/panel' })))
    return NextResponse.json({ ok: true, recordados: pend?.length ?? 0 })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
