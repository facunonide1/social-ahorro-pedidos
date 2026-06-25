import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TRANSVERSAL = ['super_admin', 'gerente', 'auditor']

/** Contadores para badges del sidebar (F6-T · T15). */
export async function GET() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({})

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo, sucursal_id')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo) return NextResponse.json({})

  // Mis tareas pendientes hoy
  const misTareas = sb.from('tareas').select('id', { count: 'exact', head: true })
    .eq('responsable_id', user.id).in('estado', ['pendiente', 'reclamada', 'en_progreso', 'rechazada'])

  // Cola de verificación (de mi sucursal o todas)
  let verif = sb.from('tareas').select('id', { count: 'exact', head: true }).eq('estado', 'en_verificacion')
  if (!TRANSVERSAL.includes(me.rol) && me.sucursal_id) verif = verif.eq('sucursal_id', me.sucursal_id)

  const aprob = sb.from('aprobaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')

  const faltantes = sb.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')

  const sinMatch = TRANSVERSAL.includes(me.rol)
    ? sb.from('items_sin_match').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
    : Promise.resolve({ count: 0 } as any)

  const noraAvisos = sb.from('nora_avisos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')

  // Irregularidades de stock pendientes — dato sensible, solo roles autorizados.
  const ROLES_IRREG = ['super_admin', 'gerente', 'auditor', 'administrativo', 'tesoreria']
  const irreg = ROLES_IRREG.includes(me.rol)
    ? sb.from('irregularidades_stock').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
    : Promise.resolve({ count: 0 } as any)

  const [t, v, a, f, sm, na, ir] = await Promise.all([misTareas, verif, aprob, faltantes, sinMatch, noraAvisos, irreg])

  // mensajes no leídos en mis canales (aprox, acotado)
  let mensajesNoLeidos = 0
  const { data: mis } = await sb.from('canal_miembros').select('canal_id, ultima_lectura_at').eq('user_id', user.id)
  const canalIds = ((mis ?? []) as any[]).map((m) => m.canal_id)
  if (canalIds.length) {
    const lu = new Map(((mis ?? []) as any[]).map((m) => [m.canal_id, m.ultima_lectura_at]))
    const { data: msgs } = await sb.from('mensajes').select('canal_id, created_at, autor_user_id').in('canal_id', canalIds).order('created_at', { ascending: false }).limit(500)
    for (const m of (msgs ?? []) as any[]) {
      if (m.autor_user_id === user.id) continue
      const t0 = lu.get(m.canal_id)
      if (t0 == null || m.created_at > t0) mensajesNoLeidos++
    }
  }

  return NextResponse.json({
    tareasPendientes: t.count ?? 0,
    verificacionesPendientes: v.count ?? 0,
    aprobacionesPendientes: a.count ?? 0,
    faltantesPendientes: f.count ?? 0,
    sinMatchearPendientes: sm.count ?? 0,
    noraAvisosPendientes: na.count ?? 0,
    irregularidadesPendientes: ir.count ?? 0,
    mensajesNoLeidos,
  })
}
