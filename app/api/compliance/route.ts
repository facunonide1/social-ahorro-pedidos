import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { turnoActual } from '@/lib/compliance/helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ADMIN: AdminRole[] = ['super_admin', 'gerente']
const codigo = (p: string) => `${p}-${Date.now().toString(36).slice(-5).toUpperCase()}`

/** OS-5b · Compliance. registrar_despacho = cualquier admin (mostrador). Marcar
 * controlado / alta papel = operativo (operaciones crear). Recall / SOP vigente
 * / config = admin (gerente+). CP-01: el despacho NO guarda médico/paciente/receta. */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion
  const esAdmin = me.rol === 'super_admin' || ADMIN.includes(me.rol)
  const puedeOperar = esAdmin || puede(me.rol, me.permisos_custom ?? {}, 'operaciones', 'crear')

  // ── registrar despacho controlado (mostrador, un tap) ──
  if (accion === 'registrar_despacho') {
    if (!b?.producto_id) return NextResponse.json({ error: 'producto requerido' }, { status: 400 })
    const { sucursalId, esTodas } = getSucursalActiva()
    const { data, error } = await adm.from('compliance_despachos').insert({
      producto_id: b.producto_id, sucursal_id: esTodas ? null : sucursalId, turno: turnoActual(), registrado_por: user.id,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, turno: turnoActual() })
  }

  if (!puedeOperar) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  // ── marcar/desmarcar controlado ──
  if (accion === 'marcar_controlado') {
    if (!b?.producto_id) return NextResponse.json({ error: 'producto requerido' }, { status: 400 })
    await adm.from('productos_catalogo').update({ es_controlado: !!b.es_controlado, lista_controlado: b.es_controlado ? (b.lista ?? null) : null }).eq('id', b.producto_id)
    return NextResponse.json({ ok: true })
  }

  // ── alta de papel de sucursal ──
  if (accion === 'alta_documento') {
    if (!b?.sucursal_id || !b?.tipo) return NextResponse.json({ error: 'sucursal y tipo requeridos' }, { status: 400 })
    const { data, error } = await adm.from('compliance_documentos').insert({
      sucursal_id: b.sucursal_id, tipo: b.tipo, descripcion: b?.descripcion ?? null, archivo_url: b?.archivo_url ?? null, vence_at: b?.vence_at || null, created_by: user.id,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  // ── config de trazabilidad ──
  if (accion === 'config_trazabilidad') {
    if (!b?.sucursal_id) return NextResponse.json({ error: 'sucursal requerida' }, { status: 400 })
    await adm.from('compliance_config').upsert({ sucursal_id: b.sucursal_id, trazabilidad_activa: !!b.activa, hora_sugerida: Number(b.hora ?? 20), updated_at: new Date().toISOString() }, { onConflict: 'sucursal_id' })
    return NextResponse.json({ ok: true })
  }

  if (!esAdmin) return NextResponse.json({ error: 'solo gerencia' }, { status: 403 })

  // ── iniciar recall (bloqueo + tareas + anuncio) ──
  if (accion === 'iniciar_recall') {
    if (!b?.producto_id) return NextResponse.json({ error: 'producto requerido' }, { status: 400 })
    const { data: prod } = await adm.from('productos_catalogo').select('nombre').eq('id', b.producto_id).maybeSingle()
    const { data: rec, error } = await adm.from('compliance_recalls').insert({
      producto_id: b.producto_id, motivo: b?.motivo ?? null, referencia_anmat: b?.referencia_anmat ?? null, estado: 'activo', creado_por: user.id,
    }).select('id').single()
    if (error || !rec) return NextResponse.json({ error: error?.message ?? 'no se pudo crear el recall' }, { status: 400 })
    await adm.from('productos_catalogo').update({ bloqueado_recall: true }).eq('id', b.producto_id)

    const { data: sucs } = await adm.from('sucursales').select('id, nombre').eq('activa', true)
    const sucList = (sucs ?? []) as any[]
    // Tareas de retiro por sucursal (evidencia foto, verificable).
    const tareas = sucList.map((s, i) => ({
      codigo: codigo(`RCL${i}`), tipo_origen: 'auto_sistema', titulo: `RECALL: retirar ${prod?.nombre ?? 'producto'} de góndola y depósito`,
      descripcion: `Retirá TODO el stock de ${prod?.nombre ?? 'el producto'} en ${s.nombre} (góndola y depósito) y sacá foto como evidencia. Ref ANMAT: ${b?.referencia_anmat ?? '—'}.`,
      prioridad: 'critica', estado: 'pendiente', asignacion_tipo: 'pool_sucursal', sucursal_id: s.id,
      verificacion_humana: true, datos_custom: { recall_id: rec.id, tipo: 'recall' },
    }))
    if (tareas.length) await adm.from('tareas').insert(tareas)
    // Anuncio con confirmación de lectura a cada canal de sucursal.
    for (const s of sucList) {
      const { data: canal } = await adm.from('canales').select('id').eq('tipo', 'sucursal').eq('sucursal_id', s.id).limit(1).maybeSingle()
      if (canal?.id) await adm.from('mensajes').insert({ canal_id: canal.id, autor_user_id: null, tipo: 'comunicado', contenido: `🔴 RECALL ANMAT: ${prod?.nombre ?? 'producto'}. Retirá el stock de góndola y depósito YA. Confirmá lectura.`, es_urgente: true })
    }
    const { data: emp } = await adm.from('users_admin').select('id').eq('activo', true)
    if (emp?.length) await adm.from('notificaciones_admin').insert((emp as any[]).map((e) => ({ user_id: e.id, tipo: 'alerta', prioridad: 'alta', titulo: `🔴 RECALL: ${prod?.nombre ?? 'producto'}`, mensaje: 'Retiro obligatorio en todas las sucursales.', url_accion: '/admin/compliance/recalls' })))
    return NextResponse.json({ ok: true, id: rec.id, tareas: tareas.length })
  }

  // ── cerrar recall (requiere tareas resueltas) → desbloquea ──
  if (accion === 'cerrar_recall') {
    if (!b?.id) return NextResponse.json({ error: 'recall requerido' }, { status: 400 })
    const { data: rec } = await adm.from('compliance_recalls').select('id, producto_id').eq('id', b.id).maybeSingle()
    if (!rec) return NextResponse.json({ error: 'recall inexistente' }, { status: 404 })
    const { count: pend } = await adm.from('tareas').select('id', { count: 'exact', head: true }).contains('datos_custom', { recall_id: rec.id }).not('estado', 'in', '("completada","en_verificacion","en_aprobacion")')
    if ((pend ?? 0) > 0) return NextResponse.json({ error: `Faltan ${pend} tarea(s) de retiro sin resolver.` }, { status: 400 })
    await adm.from('compliance_recalls').update({ estado: 'cerrado', cerrado_por: user.id, cerrado_at: new Date().toISOString() }).eq('id', b.id)
    if (rec.producto_id) await adm.from('productos_catalogo').update({ bloqueado_recall: false }).eq('id', rec.producto_id)
    return NextResponse.json({ ok: true })
  }

  // ── SOP a vigente (firma) + anuncio con confirmación de lectura ──
  if (accion === 'sop_vigente') {
    if (!b?.id) return NextResponse.json({ error: 'sop requerido' }, { status: 400 })
    const { data: sop } = await adm.from('compliance_sops').select('codigo, titulo').eq('id', b.id).maybeSingle()
    await adm.from('compliance_sops').update({ estado: 'vigente', firmado_por: user.id, firmado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', b.id)
    const { data: sucs } = await adm.from('sucursales').select('id').eq('activa', true)
    for (const s of (sucs ?? []) as any[]) {
      const { data: canal } = await adm.from('canales').select('id').eq('tipo', 'sucursal').eq('sucursal_id', s.id).limit(1).maybeSingle()
      if (canal?.id) await adm.from('mensajes').insert({ canal_id: canal.id, autor_user_id: null, tipo: 'comunicado', contenido: `📋 Nuevo procedimiento vigente: ${sop?.codigo ?? 'SOP'} · ${sop?.titulo ?? ''}. Leélo y confirmá lectura.`, es_urgente: true })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
