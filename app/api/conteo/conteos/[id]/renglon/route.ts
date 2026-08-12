import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Guarda UN renglón, apenas se cuenta.
 *
 * Guardar al final es no guardar: el momento en que se pierde un conteo es
 * justo el que no llegó al final — se cortó la señal en el pasillo del fondo,
 * se bloqueó el teléfono, entró una llamada.
 *
 * Nunca escribe la esperada. Aunque quisiera, el trigger de la base la rechaza
 * mientras el conteo no esté cerrado.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  let body: {
    listaItemId?: string
    cantidad?: number | null
    nota?: string | null
    salteado?: boolean
    motivoSalteo?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }
  if (!body.listaItemId) return NextResponse.json({ error: 'falta el item' }, { status: 400 })

  const { data: conteo } = await sb
    .from('cnt_conteos')
    .select('id, estado')
    .eq('id', params.id)
    .maybeSingle<{ id: string; estado: string }>()
  if (!conteo) return NextResponse.json({ error: 'no existe' }, { status: 404 })
  if (conteo.estado === 'cerrado' || conteo.estado === 'anulado') {
    return NextResponse.json({ error: 'El conteo ya está cerrado.' }, { status: 409 })
  }

  const salteado = body.salteado === true
  if (salteado && !String(body.motivoSalteo ?? '').trim()) {
    return NextResponse.json(
      { error: 'Para saltear un item hace falta decir por qué: un salteo en silencio no se distingue de un cero.' },
      { status: 400 },
    )
  }

  const cantidad = salteado ? null : body.cantidad
  if (!salteado && (cantidad === null || cantidad === undefined || Number.isNaN(Number(cantidad)) || Number(cantidad) < 0)) {
    return NextResponse.json({ error: 'La cantidad tiene que ser un número de 0 para arriba.' }, { status: 400 })
  }

  const { error } = await sb.from('cnt_renglones').upsert(
    {
      conteo_id: params.id,
      lista_item_id: body.listaItemId,
      cantidad_contada: cantidad,
      nota: body.nota?.trim() || null,
      salteado,
      motivo_salteo: salteado ? String(body.motivoSalteo).trim() : null,
      contado_at: new Date().toISOString(),
    },
    { onConflict: 'conteo_id,lista_item_id' },
  )
  if (error) return NextResponse.json({ error: 'No se pudo guardar el renglón.' }, { status: 400 })

  if (conteo.estado === 'abierto') {
    await sb.from('cnt_conteos').update({ estado: 'contando' }).eq('id', params.id)
  }

  return NextResponse.json({ ok: true })
}
