import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { ordenesCandidatas, vincular } from '@/lib/documentos/vincular'
import { conciliar } from '@/lib/documentos/conciliar'
import { avisarDiferencia } from '@/lib/documentos/acciones-conciliacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Órdenes que podrían corresponder a este documento. Sugerencia, no decisión. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('ver')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()
  return NextResponse.json({ candidatas: await ordenesCandidatas(adm, params.id) })
}

/** Vincula el documento a una o varias órdenes, o lo marca como compra directa. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'No pude leer los datos.' }, { status: 400 }) }

  const rol = b?.rol
  if (!['remito', 'factura', 'nota_credito'].includes(rol)) {
    return NextResponse.json({ error: 'Falta indicar si es remito, factura o nota de crédito.' }, { status: 400 })
  }

  const ordenIds: string[] = Array.isArray(b?.orden_ids) ? b.orden_ids.filter(Boolean) : []
  const sinOrden = Boolean(b?.sin_orden)
  if (!ordenIds.length && !sinOrden) {
    return NextResponse.json({ error: 'Elegí una orden o marcá que fue una compra directa.' }, { status: 400 })
  }

  const adm = createAdminClient()
  try {
    const { conciliacionId } = await vincular(adm, {
      documentoId: params.id,
      rol,
      ordenIds,
      conciliacionId: b?.conciliacion_id ?? null,
      sinOrden,
      userId: g.userId,
    })

    // Se recalcula al vincular: cada papel nuevo puede cambiar el resultado.
    const resultado = await conciliar(adm, conciliacionId, g.userId)
    await avisarDiferencia(adm, conciliacionId, g.userId)
    return NextResponse.json({ ok: true, conciliacion_id: conciliacionId, ...resultado })
  } catch (e: any) {
    console.error('[conciliacion] falló la vinculación', e)
    return NextResponse.json({ error: 'No pude vincular el documento. Probá de nuevo.' }, { status: 500 })
  }
}
