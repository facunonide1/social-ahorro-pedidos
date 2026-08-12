import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Empieza un conteo sobre una lista.
 *
 * Contar es trabajo de mostrador: lo puede hacer cualquiera con acceso al
 * punto, no sólo administración. Quien ARMA las listas sí necesita rol.
 *
 * El punto sale de la lista, y si la lista no tiene, del usuario. Nunca del
 * body: la sucursal explícita no puede venir de quien llama.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo, sucursal_id')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'no autorizado' }, { status: 403 })

  let body: { listaId?: string; tareaOrigenId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }
  if (!body.listaId) return NextResponse.json({ error: 'Falta la lista.' }, { status: 400 })

  const { data: lista } = await sb
    .from('cnt_listas')
    .select('id, punto_id')
    .eq('id', body.listaId)
    .maybeSingle<{ id: string; punto_id: string | null }>()
  if (!lista) return NextResponse.json({ error: 'Esa lista no existe o no la podés ver.' }, { status: 404 })

  const punto = lista.punto_id ?? me.sucursal_id
  if (!punto) {
    return NextResponse.json(
      { error: 'La lista no tiene punto y tu usuario tampoco: sin punto no hay stock contra qué comparar al cerrar.' },
      { status: 400 },
    )
  }

  const { data, error } = await sb
    .from('cnt_conteos')
    .insert({
      lista_id: lista.id,
      punto_id: punto,
      contado_por: user.id,
      pedido_por: user.id,
      estado: 'contando',
      tarea_origen_id: body.tareaOrigenId ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'No se pudo empezar el conteo.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, conteoId: (data as { id: string }).id })
}
