import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { prepararRevision } from '@/lib/documentos/preparar-revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** Leer una factura larga con un modelo de visión tarda. */
export const maxDuration = 300

/**
 * Lee un documento ya subido y devuelve todo lo que la revisión necesita:
 * lo extraído, el emisor identificado por CUIT y el match de cada renglón.
 *
 * Lo llama la pantalla de revisión al abrirse. Es idempotente en la parte cara:
 * si el documento ya se leyó, no se vuelve a pagar la llamada al modelo — sólo
 * se recalculan identificación y matching, que son consultas.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()
  const r = await prepararRevision(adm, params.id)

  if (r.estado === 'error') return NextResponse.json({ error: r.mensaje }, { status: 422 })
  return NextResponse.json({ ok: true, ...r.revision })
}
