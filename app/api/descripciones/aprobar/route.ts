import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES_QUE_APRUEBAN = ['super_admin', 'gerente', 'comprador', 'marketing']

/**
 * F.2 · CONFIRMAR EL LOTE.
 *
 * ── POR QUÉ DOS CLIENTES EN LA MISMA RUTA ───────────────────────────────────
 *
 * `descripciones_aprobar_lote` se llama con la sesión de quien confirma,
 * porque guarda `auth.uid()` en cada descripción aprobada: una descripción
 * publicada sin dueño es una que nadie confirmó.
 *
 * Las que la persona saca del lote al leerlo se marcan con el cliente de
 * servicio. No por comodidad: `producto_descripciones` sólo tiene política de
 * SELECT, así que un update con la sesión del usuario lo frena la RLS y
 * devuelve cero filas **sin error** — las sacadas del lote quedarían dentro y
 * se aprobarían. El rol se verifica acá antes de tocar nada.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!perfil?.activo || !ROLES_QUE_APRUEBAN.includes(perfil.rol)) {
    return NextResponse.json({ error: 'sin permiso para aprobar descripciones' }, { status: 403 })
  }

  let lote: string | undefined
  let sacar: string[] = []
  try {
    const body = await req.json()
    lote = body?.lote
    sacar = Array.isArray(body?.sacar) ? body.sacar.filter((x: unknown) => typeof x === 'string') : []
  } catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }) }
  if (!lote) return NextResponse.json({ error: 'falta el lote' }, { status: 400 })

  // Se rechazan ANTES de aprobar: si se aprobara primero, saldrían al canal
  // por un instante.
  let sacadas = 0
  if (sacar.length) {
    const { data, error } = await createAdminClient()
      .from('producto_descripciones')
      .update({ estado: 'rechazada', rechazada_motivo: 'la saqué del lote al revisarlo' })
      .in('producto_id', sacar).eq('lote_id', lote).eq('estado', 'propuesta')
      .select('producto_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    sacadas = (data ?? []).length
    if (sacadas !== sacar.length) {
      // No se frena: lo que ya no estaba como propuesta no se puede sacar. Pero
      // se dice, porque la diferencia entre «saqué 3» y «se sacaron 2» es
      // justamente lo que nadie revisa después.
      console.warn(`[descripciones] se pidió sacar ${sacar.length} del lote ${lote} y se sacaron ${sacadas}`)
    }
  }

  const { data, error } = await sb.rpc('descripciones_aprobar_lote', { p_lote: lote })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as { ok: boolean; por_que?: string }
  if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo' }, { status: 400 })
  return NextResponse.json({ ...(data as object), sacadas_a_mano: sacadas, se_pidio_sacar: sacar.length })
}
