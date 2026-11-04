import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { claveValida, leerIngesta } from '@/lib/precios/entrada'
import { siApagada } from '@/lib/precios/servidor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/precios/ingest · lo que manda Grok Bot.
 *
 * Detrás de NORA_BANDERA_COMPARADOR_PRECIOS (apagada: 404). Pide la clave
 * propia en `x-nora-precios-clave`, comparada en tiempo constante contra
 * PRECIOS_INGEST_CLAVE; sin clave configurada no entra nadie.
 *
 * Nota: el middleware todavía manda a /login lo que no tiene sesión. Para que
 * el bot llegue hace falta una excepción ahí, que es autenticación y espera el
 * OK de Facundo (PENDIENTE.md §7).
 *
 * Cuerpo: { fuente: 'grok_bot', filas: [{ proveedor, cuit?, codigo_barras, sku?,
 *           descripcion?, precio, capturado_at }] }, hasta 5000 filas.
 */
export async function POST(req: NextRequest) {
  const apagada = siApagada()
  if (apagada) return apagada

  if (!claveValida(req.headers.get('x-nora-precios-clave'), process.env.PRECIOS_INGEST_CLAVE)) {
    return NextResponse.json({ error: 'clave inválida o no configurada' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'el cuerpo no es JSON' }, { status: 400 }) }
  const lectura = leerIngesta(body)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 })

  const { data, error } = await createAdminClient().rpc('precios_ingestar', {
    p_fuente: lectura.fuente, p_origen: 'grok_bot', p_filas: lectura.filas, p_por: null,
  })
  if (error) {
    console.error('[precios] precios_ingestar:', error.message)
    return NextResponse.json({ error: 'no se pudo guardar la ingesta' }, { status: 500 })
  }
  return NextResponse.json({ ingesta: data, descartadas_antes_de_la_base: lectura.descartadas })
}
