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
  // El nombre vive en auth.users.user_metadata, no en users_admin (que no tiene
  // columna 'nombre' → seleccionarla rompía el gate).
  const { data: me } = await sb.from('users_admin').select('rol, activo, sucursal_id').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 as const }
  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? null
  return { ok: true as const, userId: user.id, rol: me.rol, nombre, sucursalId: me.sucursal_id }
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

  // ---- crear encuesta (encargados · OS-2b · E) ----
  if (accion === 'crear_encuesta') {
    if (!esEncargado) return NextResponse.json({ error: 'solo encargados crean encuestas' }, { status: 403 })
    const pregunta = String(b?.pregunta ?? '').trim()
    const opciones = (Array.isArray(b?.opciones) ? b.opciones : []).map((o: any) => String(o).trim()).filter(Boolean).slice(0, 6)
    if (!b?.canal_id || !pregunta || opciones.length < 2) return NextResponse.json({ error: 'canal, pregunta y 2 opciones mínimo' }, { status: 400 })
    const { data: msg, error } = await adm.from('mensajes').insert({ canal_id: b.canal_id, autor_user_id: g.userId, tipo: 'encuesta', contenido: pregunta }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { error: e2 } = await adm.from('encuestas').insert({ mensaje_id: msg.id, opciones, multi: !!b?.multi })
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: msg.id })
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
    const { data: msg } = await adm.from('mensajes').select('canal_id, contenido, adjuntos, entidad_relacionada').eq('id', b.mensaje_id).maybeSingle()
    // Idempotencia: si el mensaje ya se convirtió, devolver la tarea existente.
    if (msg?.entidad_relacionada?.tipo === 'tarea') {
      return NextResponse.json({ ok: true, tarea_id: msg.entidad_relacionada.id, codigo: msg.entidad_relacionada.codigo, ya: true })
    }
    // El adjunto foto del mensaje viaja como evidencia inicial de la tarea (OS-2b · C).
    const adjs: any[] = Array.isArray(msg?.adjuntos) ? (msg!.adjuntos as any[]) : []
    const evidencias = adjs
      .filter((a) => (typeof a?.tipo === 'string' && a.tipo.startsWith('image')) || /\.(jpe?g|png|webp)$/i.test(String(a?.url ?? a?.path ?? a?.nombre ?? '')))
      .map((a) => ({ tipo: 'foto', url: a.path ?? a.url ?? null, timestamp: new Date().toISOString(), user_id: g.userId }))
      .filter((e) => e.url)
    const { data: tarea, error } = await adm.from('tareas').insert({
      codigo: TAREA_CODIGO(), tipo_tarea_id: b?.tipo_tarea_id ?? null, tipo_origen: 'nora', titulo: b.titulo, descripcion: b?.descripcion ?? msg?.contenido ?? null,
      prioridad: b?.prioridad ?? 'media', estado: 'pendiente',
      asignacion_tipo: b?.responsable_id ? 'usuario_especifico' : 'pool_sucursal',
      responsable_id: b?.responsable_id ?? null, sucursal_id: b?.sucursal_id ?? null,
      fecha_vencimiento: b?.fecha_vencimiento ?? null,
      evidencias,
      datos_custom: { origen_mensaje_id: b.mensaje_id, canal_id: msg?.canal_id, creada_por: g.userId },
    }).select('id, codigo').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // vincular mensaje ↔ tarea + postear sistema
    await adm.from('mensajes').update({ entidad_relacionada: { tipo: 'tarea', id: tarea.id, codigo: tarea.codigo } }).eq('id', b.mensaje_id)
    if (msg?.canal_id) await adm.from('mensajes').insert({ canal_id: msg.canal_id, autor_user_id: null, tipo: 'sistema', contenido: `📋 Tarea creada: "${b.titulo}" (${tarea.codigo})${b?.responsable_id ? ', asignada' : ', al pool de la sucursal'}.`, entidad_relacionada: { tipo: 'tarea', id: tarea.id, codigo: tarea.codigo } })
    return NextResponse.json({ ok: true, tarea_id: tarea.id, codigo: tarea.codigo })
  }

  // ---- recordar comunicado a los que faltan (OS-2b · F) ----
  if (accion === 'recordar_comunicado') {
    if (!esEncargado) return NextResponse.json({ error: 'solo encargados recuerdan comunicados' }, { status: 403 })
    if (!b?.mensaje_id) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })
    const { data: msg } = await adm.from('mensajes').select('canal_id, contenido').eq('id', b.mensaje_id).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'comunicado no encontrado' }, { status: 404 })
    const [{ data: miembros }, { data: lecturas }] = await Promise.all([
      adm.from('canal_miembros').select('user_id').eq('canal_id', msg.canal_id),
      adm.from('mensaje_lecturas').select('user_id').eq('mensaje_id', b.mensaje_id),
    ])
    const leyeron = new Set(((lecturas ?? []) as any[]).map((l) => l.user_id))
    const faltan = ((miembros ?? []) as any[]).map((m) => m.user_id).filter((u) => u !== g.userId && !leyeron.has(u))
    if (faltan.length === 0) return NextResponse.json({ ok: true, recordados: 0 })
    await adm.from('notificaciones_admin').insert(faltan.map((uid) => ({
      user_id: uid, tipo: 'comunicado', prioridad: 'alta',
      titulo: 'Recordatorio: comunicado sin confirmar',
      mensaje: (msg.contenido ?? '').slice(0, 120),
      url_accion: `/admin/comunicacion?canal=${msg.canal_id}&msg=${b.mensaje_id}`,
    })))
    return NextResponse.json({ ok: true, recordados: faltan.length })
  }

  // ---- BOTÓN DE PÁNICO (OS-2b · D) ----
  if (accion === 'panico') {
    const sucursalId = g.sucursalId
    // Canal de la sucursal (para el mensaje urgente + banner).
    let canalId: string | null = null
    if (sucursalId) {
      const { data: canal } = await adm.from('canales').select('id').eq('tipo', 'sucursal').eq('sucursal_id', sucursalId).limit(1).maybeSingle()
      canalId = canal?.id ?? null
    }
    const { data: ev, error } = await adm.from('panico_eventos').insert({ user_id: g.userId, sucursal_id: sucursalId, canal_id: canalId, estado: 'activo' }).select('id').single()
    if (error || !ev) return NextResponse.json({ error: error?.message ?? 'no se pudo registrar' }, { status: 400 })

    if (canalId) {
      const { data: msg } = await adm.from('mensajes').insert({
        canal_id: canalId, autor_user_id: g.userId, tipo: 'texto',
        contenido: `🚨 BOTÓN DE PÁNICO activado por ${g.nombre ?? 'un empleado'}. Necesita ayuda YA.`,
        es_urgente: true, entidad_relacionada: { tipo: 'panico', id: ev.id },
      }).select('id').single()
      if (msg?.id) await adm.from('panico_eventos').update({ mensaje_id: msg.id }).eq('id', ev.id)
    }

    // Notificar a super_admin + encargados de la sucursal.
    const targets = new Set<string>()
    const { data: sadmins } = await adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true)
    for (const u of (sadmins ?? []) as any[]) targets.add(u.id)
    if (sucursalId) {
      const { data: encs } = await adm.from('users_admin').select('id').eq('sucursal_id', sucursalId).eq('activo', true).in('rol', ['gerente', 'sucursal', 'encargado_sucursal', 'administrativo'])
      for (const u of (encs ?? []) as any[]) targets.add(u.id)
    }
    targets.delete(g.userId)
    if (targets.size) {
      await adm.from('notificaciones_admin').insert([...targets].map((uid) => ({
        user_id: uid, tipo: 'urgente', prioridad: 'critica',
        titulo: '🚨 PÁNICO', mensaje: `${g.nombre ?? 'Un empleado'} activó el botón de pánico.`,
        url_accion: canalId ? `/admin/comunicacion?canal=${canalId}` : '/admin/comunicacion',
      })))
    }
    return NextResponse.json({ ok: true, evento_id: ev.id, canal_id: canalId })
  }

  // ---- de-escalada de pánico ----
  if (accion === 'resolver_panico') {
    if (!b?.evento_id || !['falsa_alarma', 'resuelto'].includes(b?.estado)) return NextResponse.json({ error: 'datos requeridos' }, { status: 400 })
    const { data: ev } = await adm.from('panico_eventos').select('id, user_id, canal_id, estado').eq('id', b.evento_id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'evento no encontrado' }, { status: 404 })
    // El emisor o un encargado pueden de-escalar.
    if (ev.user_id !== g.userId && !esEncargado) return NextResponse.json({ error: 'no podés resolver este evento' }, { status: 403 })
    await adm.from('panico_eventos').update({ estado: b.estado, resuelto_por: g.userId, resuelto_at: new Date().toISOString() }).eq('id', ev.id)
    if (ev.canal_id) {
      await adm.from('mensajes').insert({
        canal_id: ev.canal_id, autor_user_id: null, tipo: 'sistema',
        contenido: `✓ Pánico ${b.estado === 'falsa_alarma' ? 'marcado como falsa alarma' : 'resuelto'} por ${g.nombre ?? 'un encargado'}.`,
      })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
