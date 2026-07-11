import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
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

type Prop = { titulo: string; descripcion: string; prioridad: string; sucursal_id: string | null; origen: string }

function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function horaAR(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' }).format(new Date())
}

/** Propuestas de NORA cruzando vencimientos + irregularidades + faltantes. */
async function generarPropuestas(adm: any, sucursalId: string | null, esTodas: boolean): Promise<Prop[]> {
  const scope = (q: any) => (!esTodas && sucursalId ? q.eq('sucursal_id', sucursalId) : q)
  const props: Prop[] = []
  try {
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const { data } = await scope(adm.from('vencimientos').select('sucursal_id, cantidad, fecha_vencimiento, productos_catalogo(nombre)').eq('estado', 'vigente').lte('fecha_vencimiento', en30).order('fecha_vencimiento').limit(6))
    for (const v of (data ?? []) as any[]) props.push({ titulo: `Resolver vencimiento: ${v.productos_catalogo?.nombre ?? 'producto'}`, descripcion: `${v.cantidad} u. vencen el ${v.fecha_vencimiento}. Reponer góndola, liquidar o transferir.`, prioridad: 'alta', sucursal_id: v.sucursal_id, origen: 'vencimiento' })
  } catch { /* */ }
  try {
    const { data } = await scope(adm.from('irregularidades_stock').select('sucursal_id, sku, valor_diferencia, productos_catalogo(nombre)').eq('estado', 'pendiente').eq('tipo', 'faltante').order('valor_diferencia').limit(4))
    for (const i of (data ?? []) as any[]) props.push({ titulo: `Revisar descuadre: ${i.productos_catalogo?.nombre ?? i.sku}`, descripcion: `Faltante por $${Math.round(Math.abs(Number(i.valor_diferencia))).toLocaleString('es-AR')}. Contá y justificá.`, prioridad: 'alta', sucursal_id: i.sucursal_id, origen: 'irregularidad' })
  } catch { /* */ }
  try {
    const { data } = await scope(adm.from('avisos_faltante').select('sucursal_id, texto_libre, productos_catalogo(nombre)').eq('estado', 'nuevo').limit(4))
    for (const a of (data ?? []) as any[]) props.push({ titulo: `Reponer faltante: ${a.productos_catalogo?.nombre ?? a.texto_libre ?? 'producto'}`, descripcion: 'Reportado como faltante en góndola.', prioridad: 'media', sucursal_id: a.sucursal_id, origen: 'faltante' })
  } catch { /* */ }
  return props.slice(0, 12)
}

/**
 * Publica la agenda de una sucursal para una fecha (idempotente):
 * crea las tareas etiquetadas con agenda_dia_id, las asigna y notifica.
 * Si la agenda ya estaba publicada, no crea nada de nuevo.
 */
async function publicar(
  adm: any,
  sucursalId: string,
  fecha: string,
  items: any[],
  userId: string | null,
): Promise<{ creadas: number; already: boolean }> {
  // Trae/crea la fila del día (unique sucursal+fecha).
  const { data: existente } = await adm.from('agendas_dia').select('id, estado').eq('sucursal_id', sucursalId).eq('fecha', fecha).maybeSingle()
  if (existente?.estado === 'publicada') return { creadas: 0, already: true }

  let agendaId = existente?.id as string | undefined
  if (!agendaId) {
    const { data: nueva } = await adm.from('agendas_dia').insert({ sucursal_id: sucursalId, fecha, estado: 'borrador' }).select('id').maybeSingle()
    agendaId = nueva?.id
  }

  const filas = (items ?? []).filter((i: any) => i?.titulo).map((i: any) => ({
    titulo: String(i.titulo).slice(0, 200),
    descripcion: i.descripcion ?? null,
    tipo_origen: 'auto_sistema',
    prioridad: i.prioridad ?? 'media',
    estado: i.responsable_id ? 'asignada' : 'pendiente',
    responsable_id: i.responsable_id ?? null,
    fecha_asignacion: i.responsable_id ? new Date().toISOString() : null,
    sucursal_id: i.sucursal_id ?? sucursalId,
    entidad_relacionada: i.origen ?? 'agenda',
    agenda_dia_id: agendaId,
    creado_por: userId,
  }))

  let creadas = 0
  if (filas.length > 0) {
    const { data: ins, error } = await adm.from('tareas').insert(filas).select('id, responsable_id, titulo')
    if (error) throw new Error(error.message)
    creadas = (ins ?? []).length
    // Notificar a cada responsable asignado.
    for (const t of (ins ?? []) as any[]) {
      if (t.responsable_id) {
        await adm.from('notificaciones_admin').insert({
          user_id: t.responsable_id, tipo: 'tarea', prioridad: 'media',
          titulo: 'Nueva tarea del día', mensaje: t.titulo, url_accion: `/admin/tareas/${t.id}`,
        })
      }
    }
  }

  await adm.from('agendas_dia').update({
    estado: 'publicada', publicada_at: new Date().toISOString(), publicada_por: userId, tareas_creadas: creadas,
  }).eq('id', agendaId)

  return { creadas, already: false }
}

/** GET: propuestas + estado de la agenda del día. Auto-publica (lazy) si venció la hora. */
export async function GET() {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const fecha = hoyAR()

  // Estado de la agenda del día (solo con sucursal concreta).
  let estado: 'borrador' | 'publicada' = 'borrador'
  let autoHora: string | null = null
  if (!esTodas && sucursalId) {
    const { data: row } = await adm.from('agendas_dia').select('estado, auto_hora').eq('sucursal_id', sucursalId).eq('fecha', fecha).maybeSingle()
    estado = (row?.estado as any) ?? 'borrador'
    autoHora = row?.auto_hora ? String(row.auto_hora).slice(0, 5) : null

    // Auto-publicación lazy (Hobby-safe, sin cron): si hay hora límite y ya pasó
    // y sigue en borrador, se publica sola con las propuestas de NORA al primer acceso.
    if (estado === 'borrador' && autoHora && horaAR() >= autoHora) {
      const props = await generarPropuestas(adm, sucursalId, false)
      const res = await publicar(adm, sucursalId, fecha, props, null)
      if (!res.already) estado = 'publicada'
    }
  }

  const propuestas = estado === 'publicada' ? [] : await generarPropuestas(adm, sucursalId, esTodas)
  return NextResponse.json({ propuestas, estado, autoHora, fecha, esTodas, sucursalId })
}

/** POST: publicar la agenda (idempotente) o configurar la hora de auto-publicación. */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const modo = b?.modo ?? 'publicar'
  const fecha = b?.fecha || hoyAR()
  const sucursalId = b?.sucursal_id

  if (modo === 'config') {
    if (!sucursalId) return NextResponse.json({ error: 'elegí una sucursal' }, { status: 400 })
    const autoHora = b?.auto_hora || null
    const { data: existente } = await adm.from('agendas_dia').select('id').eq('sucursal_id', sucursalId).eq('fecha', fecha).maybeSingle()
    if (existente?.id) {
      await adm.from('agendas_dia').update({ auto_hora: autoHora }).eq('id', existente.id)
    } else {
      await adm.from('agendas_dia').insert({ sucursal_id: sucursalId, fecha, estado: 'borrador', auto_hora: autoHora })
    }
    return NextResponse.json({ ok: true })
  }

  // modo publicar
  if (!sucursalId) return NextResponse.json({ error: 'elegí una sucursal para publicar la agenda' }, { status: 400 })
  const items = Array.isArray(b?.items) ? b.items : []
  if (!items.length) return NextResponse.json({ error: 'no hay tareas para publicar' }, { status: 400 })
  try {
    const res = await publicar(adm, sucursalId, fecha, items, g.userId)
    if (res.already) return NextResponse.json({ ok: true, already: true, creadas: 0 })
    return NextResponse.json({ ok: true, creadas: res.creadas })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error al publicar' }, { status: 400 })
  }
}
