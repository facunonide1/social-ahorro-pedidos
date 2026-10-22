import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * C.5 · LA BITÁCORA.
 *
 * Lo que se decide queda escrito: qué propuso el agente, el cálculo que mostró,
 * cuánto costaba no hacerlo, quién decidió y qué eligió.
 *
 * **Es lo que llena el marcador de aciertos.** Sin esto el marcador dice «sin
 * antecedentes» para siempre, y la capa de dirección nunca se puede evaluar.
 *
 * `acerto` NO se escribe acá: queda en null. Lo llena quien mide después, y
 * null no es falso — es que todavía no se sabe.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })

  const b = await req.json().catch(() => null)
  const clave = typeof b?.clave === 'string' ? b.clave : null
  const estado = b?.estado === 'aceptada' || b?.estado === 'rechazada' ? b.estado : null
  if (!clave || !estado) return NextResponse.json({ error: 'falta la decisión' }, { status: 400 })

  const adm = createAdminClient()
  const { error } = await adm.from('agente_bitacora').upsert({
    clave,
    agente: String(b?.agente ?? 'desconocido'),
    accion: 'decision_del_panel',
    sucursal_id: me.sucursal_id,
    propuso: String(b?.propuso ?? ''),
    por_que: b?.por_que ?? null,
    // Null y no cero cuando no era calculable: cero diría que no costaba nada.
    costo_por_dia: b?.costo_por_dia == null ? null : Number(b.costo_por_dia),
    estado,
    decidio: user.id,
    decidio_at: new Date().toISOString(),
    decidio_que: estado === 'aceptada' ? 'me hago cargo' : 'ahora no',
  }, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * D.5 · DESHACER.
 *
 * Borra la fila de la bitácora, no la marca como revertida: si alguien aprieta
 * «deshacer» tres segundos después es porque se equivocó de botón, y dejar un
 * rastro de eso ensucia la medición del agente con ruido que no es una
 * decisión.
 *
 * Sólo el que la tomó, y sólo mientras siga siendo la suya.
 */
export async function DELETE(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const b = await req.json().catch(() => null)
  const clave = typeof b?.clave === 'string' ? b.clave : null
  if (!clave) return NextResponse.json({ error: 'falta la clave' }, { status: 400 })

  const adm = createAdminClient()
  const { error } = await adm.from('agente_bitacora')
    .delete().eq('clave', clave).eq('decidio', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
