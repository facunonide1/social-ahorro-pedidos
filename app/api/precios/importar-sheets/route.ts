import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { leerCsvDeSheets, leerIngesta, urlDeExportacion } from '@/lib/precios/entrada'
import { quienPuedeVer, siApagada } from '@/lib/precios/servidor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TOPE_BYTES = 2 * 1024 * 1024
const TOPE_MS = 15_000

const HOSTS_DE_GOOGLE = /(^|\.)(docs\.google\.com|googleusercontent\.com)$/

/**
 * Baja el CSV siguiendo las redirecciones A MANO: cada salto se valida antes de
 * pedirlo, para que el servidor nunca le pida nada a un host que no sea de
 * Google. Y se lee en stream con tope, haya o no content-length.
 */
async function leerHoja(url: string): Promise<string> {
  let actual = url
  for (let salto = 0; salto < 4; salto++) {
    const r = await fetch(actual, { signal: AbortSignal.timeout(TOPE_MS), redirect: 'manual' })
    if (r.status >= 300 && r.status < 400) {
      const siguiente = r.headers.get('location')
      if (!siguiente) throw new Error('la hoja redirigió sin decir a dónde')
      const u = new URL(siguiente, actual)
      if (u.protocol !== 'https:' || !HOSTS_DE_GOOGLE.test(u.hostname)) {
        throw new Error('la hoja redirigió a un lugar que no es de Google')
      }
      actual = u.toString()
      continue
    }
    if (!r.ok) throw new Error(`Google respondió ${r.status}: ¿la hoja está compartida por link?`)
    if (!r.body) return ''
    const lector = r.body.getReader()
    const pedazos: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { value, done } = await lector.read()
      if (done) break
      total += value.length
      if (total > TOPE_BYTES) { await lector.cancel(); throw new Error('la hoja pesa más de 2 MB') }
      pedazos.push(value)
    }
    return new TextDecoder().decode(Buffer.concat(pedazos))
  }
  throw new Error('la hoja redirigió demasiadas veces')
}

/**
 * POST /api/precios/importar-sheets · la alternativa al bot: una hoja de
 * Google Sheets compartida por link, con columnas Proveedor, CUIT, Código de
 * barras, Descripción, Precio y Leído (por nombre, en cualquier orden).
 *
 * Solo `https://docs.google.com/spreadsheets/d/<id>`: el servidor no le pide
 * nada a otra URL. Detrás de la bandera, con sesión y rol.
 */
export async function POST(req: NextRequest) {
  const apagada = siApagada()
  if (apagada) return apagada

  const quien = await quienPuedeVer(createClient())
  if (quien instanceof NextResponse) return quien

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'el cuerpo no es JSON' }, { status: 400 }) }
  const exportar = urlDeExportacion(String(body?.url ?? ''))
  if (!exportar) {
    return NextResponse.json({ error: 'tiene que ser un link de Google Sheets (https://docs.google.com/spreadsheets/d/…)' }, { status: 400 })
  }

  let csv: string
  try {
    csv = await leerHoja(exportar)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'no se pudo leer la hoja'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  let filas: Record<string, string | undefined>[]
  try { filas = leerCsvDeSheets(csv) } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'no se pudo leer la hoja' }, { status: 400 })
  }
  const lectura = leerIngesta({ fuente: 'sheets', filas })
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 })

  const { data, error } = await createAdminClient().rpc('precios_ingestar', {
    p_fuente: 'sheets', p_origen: exportar, p_filas: lectura.filas, p_por: quien.id,
  })
  if (error) {
    console.error('[precios] precios_ingestar (sheets):', error.message)
    return NextResponse.json({ error: 'no se pudo guardar la ingesta' }, { status: 500 })
  }
  return NextResponse.json({ ingesta: data, descartadas_antes_de_la_base: lectura.descartadas })
}
