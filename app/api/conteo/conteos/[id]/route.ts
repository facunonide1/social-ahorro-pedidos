import { NextResponse } from 'next/server'

import { payloadParaContar } from '@/lib/conteo/payload'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * LO QUE NECESITA QUIEN CUENTA, Y NADA MÁS.
 *
 * El payload lo arma `payloadParaContar`, que es el mismo que usa la pantalla.
 * Un solo lugar donde pueda colarse la cantidad esperada, y verificado por
 * `scripts/conteo-verificar-ciego.ts` sobre la salida real de esa función.
 *
 * Va con el cliente de SESIÓN: si esta persona no puede ver el conteo, la RLS
 * devuelve vacío. El cliente de administración acá sería un agujero.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const payload = await payloadParaContar(sb, params.id)
  if (!payload) return NextResponse.json({ error: 'no existe' }, { status: 404 })
  return NextResponse.json(payload)
}
