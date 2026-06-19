import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { responderNora } from '@/lib/comunicacion/nora-chat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ENCARGADOS: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'sucursal']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo, nombre, sucursal_id').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; nombre: string | null; sucursal_id: string | null }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id, rol: me.rol, nombre: me.nombre, sucursalId: me.sucursal_id }
}

const TAREA_CODIGO = () => `CHT-${Date.now().toString(36).slice(-6).toUpperCase()}`

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion ?? 'enviar'
  const esEncargado = ENCARGADOS.includes(g.rol)

  // ---- crear canal (encargados) ----
  if (accion === 'crear_canal') {
    if (!esEncargado) return NextResponse.json({ error: 'solo encargados pueden crear canales' }, { status: 403 })
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data: canal, error } = await adm.from('canales').insert({
      nombre: b.nombre, tipo: b?.tipo ?? 'general', descripcion: b?.descripcion ?? null,
      vinculo_modulo: b?.vinculo_modulo ?? null, vinculo_ref_id: b?.vinculo_ref_id ?? null,
      sucursal_id: b?.sucursal_id ?? null, es_privado: b?.es_privado ?? false, creado_por: g.userId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const miembros: string[] = Array.isArray(b?.miembros) ? b.miembros : []
    if (!miembros.includes(g.userId)) miembros.push(g.userId)
    await adm.from('canal_miembros').insert(miembros.map((u) => ({ canal_id: canal.id, user_id: u, rol_en_canal: u === g.userId ? 'admin' : 'miembro' })))
    return NextResponse.json({ ok: true, id: canal.id })
  }

  // ---- enviar mensaje ----
  if (accion === 'enviar') {
    if (!b?.canal_id || (!b?.contenido && !(b?.adjuntos?.length) && b?.tipo !== 'voz')) return NextResponse.json({ error: 'canal y contenido requeridos' }, { status: 400 })
    const contenido: string = b.contenido ?? ''
    const { data: msg, error } = await adm.from('mensajes').insert({
      canal_id: b.canal_id, hilo_id: b?.hilo_id ?? null, autor_user_id: g.userId,
      tipo: b?.tipo ?? 'texto', contenido, adjuntos: b?.adjuntos ?? [], acciones: b?.acciones ?? null,
      menciones: b?.menciones ?? [], es_urgente: !!b?.es_urgente, entidad_relacionada: b?.entidad_relacionada ?? null,
      programado_para: b?.programado_para ?? null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // urgente → notificar a miembros
    if (b?.es_urgente) {
      const { data: ms } = await adm.from('canal_miembros').select('user_id').eq('canal_id', b.canal_id).neq('user_id', g.userId)
      if (ms?.length) await adm.from('notificaciones_admin').insert((ms as any[]).map((m) => ({ user_id: m.user_id, tipo: 'urgente', prioridad: 'critica', titulo: '🚨 Mensaje urgente', mensaje: contenido.slice(0, 120), url_accion: `/admin/comunicacion?canal=${b.canal_id}` })))
    }
    // @NORA → respuesta automática (mensaje de sistema)
    if (/(^|\s)@nora\b/i.test(contenido)) {
      const respuesta = await responderNora(adm, contenido, b.canal_id)
      if (respuesta) await adm.from('mensajes').insert({ canal_id: b.canal_id, hilo_id: b?.hilo_id ?? null, autor_user_id: null, tipo: 'sistema', contenido: respuesta.texto, entidad_relacionada: respuesta.entidad ?? null, acciones: respuesta.acciones ?? null })
    }
    return NextResponse.json({ ok: true, id: msg.id })
  }

  // ---- marcar leído (actualiza ultima_lectura del canal) ----
  if (accion === 'leer') {
    if (!b?.canal_id) return NextResponse.json({ error: 'canal requerido' }, { status: 400 })
    await adm.from('canal_miembros').update({ ultima_lectura_at: new Date().toISOString() }).eq('canal_id', b.canal_id).eq('user_id', g.userId)
    return NextResponse.json({ ok: true })
  }

  // ---- reaccionar ----
  if (accion === 'reaccionar') {
    if (!b?.mensaje_id || !b?.emoji) return NextResponse.json({ error: 'datos requeridos' }, { status: 400 })
    const { data: ex } = await adm.from('mensaje_reacciones').select('id').eq('mensaje_id', b.mensaje_id).eq('user_id', g.userId).eq('emoji', b.emoji).maybeSingle()
    if (ex) await adm.from('mensaje_reacciones').delete().eq('id', ex.id)
    else await adm.from('mensaje_reacciones').insert({ mensaje_id: b.mensaje_id, user_id: g.userId, emoji: b.emoji })
    return NextResponse.json({ ok: true })
  }

  // ---- fijar / resolver hilo ----
  if (accion === 'fijar') { await adm.from('mensajes').update({ fijado: !!b.fijado }).eq('id', b.mensaje_id); return NextResponse.json({ ok: true }) }
  if (accion === 'resolver_hilo') { await adm.from('mensajes').update({ hilo_resuelto: true }).eq('id', b.mensaje_id); return NextResponse.json({ ok: true }) }

  // ---- confirmar lectura de comunicado ----
  if (accion === 'confirmar_lectura') {
    if (!b?.mensaje_id) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })
    await adm.from('mensaje_lecturas').upsert({ mensaje_id: b.mensaje_id, user_id: g.userId, leido_at: new Date().toISOString() }, { onConflict: 'mensaje_id,user_id' })
    return NextResponse.json({ ok: true })
  }

  // ---- votar encuesta ----
  if (accion === 'votar') {
    if (!b?.encuesta_id || !b?.opcion) return NextResponse.json({ error: 'datos requeridos' }, { status: 400 })
    const { data: enc } = await adm.from('encuestas').select('multi').eq('id', b.encuesta_id).maybeSingle()
    if (!enc?.multi) await adm.from('encuesta_votos').delete().eq('encuesta_id', b.encuesta_id).eq('user_id', g.userId)
    await adm.from('encuesta_votos').upsert({ encuesta_id: b.encuesta_id, user_id: g.userId, opcion: b.opcion }, { onConflict: 'encuesta_id,user_id,opcion' })
    return NextResponse.json({ ok: true })
  }

  // ---- crear tarea desde mensaje (encargados) ----
  if (accion === 'crear_tarea') {
    if (!esEncargado) return NextResponse.json({ error: 'solo encargados crean tareas' }, { status: 403 })
    if (!b?.mensaje_id || !b?.titulo) return NextResponse.json({ error: 'mensaje y título requeridos' }, { status: 400 })
    const { data: msg } = await adm.from('mensajes').select('canal_id, contenido, entidad_relacionada').eq('id', b.mensaje_id).maybeSingle()
    const { data: tarea, error } = await adm.from('tareas').insert({
      codigo: TAREA_CODIGO(), tipo_origen: 'manual', titulo: b.titulo, descripcion: b?.descripcion ?? msg?.contenido ?? null,
      prioridad: b?.prioridad ?? 'media', estado: 'pendiente',
      asignacion_tipo: b?.responsable_id ? 'usuario_especifico' : 'pool_sucursal',
      responsable_id: b?.responsable_id ?? null, sucursal_id: b?.sucursal_id ?? null,
      datos_custom: { origen_mensaje_id: b.mensaje_id, canal_id: msg?.canal_id, creada_por: g.userId },
    }).select('id, codigo').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // vincular mensaje ↔ tarea + postear sistema
    await adm.from('mensajes').update({ entidad_relacionada: { tipo: 'tarea', id: tarea.id, codigo: tarea.codigo } }).eq('id', b.mensaje_id)
    if (msg?.canal_id) await adm.from('mensajes').insert({ canal_id: msg.canal_id, autor_user_id: null, tipo: 'sistema', contenido: `📋 Tarea creada: "${b.titulo}" (${tarea.codigo})${b?.responsable_id ? ', asignada' : ', al pool de la sucursal'}.`, entidad_relacionada: { tipo: 'tarea', id: tarea.id, codigo: tarea.codigo } })
    return NextResponse.json({ ok: true, tarea_id: tarea.id, codigo: tarea.codigo })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
