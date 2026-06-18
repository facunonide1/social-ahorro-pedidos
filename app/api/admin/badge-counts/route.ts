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

  const [t, v, a] = await Promise.all([misTareas, verif, aprob])

  return NextResponse.json({
    tareasPendientes: t.count ?? 0,
    verificacionesPendientes: v.count ?? 0,
    aprobacionesPendientes: a.count ?? 0,
  })
}
