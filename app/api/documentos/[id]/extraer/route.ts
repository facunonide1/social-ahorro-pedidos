import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { procesarExtraccion } from '@/lib/documentos/extraer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** Leer una factura larga con un modelo de visión tarda. */
export const maxDuration = 300

/**
 * Dispara la lectura de un documento ya subido.
 *
 * Lo llama la pantalla de revisión al abrirse, cuando la extracción todavía
 * está en `pendiente`. Es idempotente: si ya se leyó, devuelve lo guardado sin
 * volver a pagar la llamada al modelo.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()
  const r = await procesarExtraccion(adm, params.id)

  if (r.estado === 'error') return NextResponse.json({ error: r.mensaje }, { status: 422 })
  return NextResponse.json({ ok: true, datos: r.datos, confianza_global: r.confianzaGlobal })
}
