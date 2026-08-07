import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { aprenderAliasTercero } from '@/lib/documentos/identificar'
import { aprenderAliasItem } from '@/lib/documentos/matchear'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type LineaBody = {
  nro_linea?: number
  codigo_tercero?: string | null
  descripcion_leida?: string
  cantidad?: string | number | null
  unidad?: string | null
  precio_unitario?: string | number | null
  descuento_pct?: string | number | null
  precio_neto?: string | number | null
  alicuota_iva?: string | number | null
  precio_con_iva?: string | number | null
  total_linea?: string | number | null
  item_id?: string | null
  match_estado?: string
  match_confianza?: string | number | null
}

/**
 * Confirma una captura revisada por una persona.
 *
 * La escritura de documento + líneas + eventos de precio + cuenta por pagar va
 * en una sola transacción (doc_confirmar_documento). Los alias aprendidos se
 * escriben después: no son parte de la deuda, y si fallaran no debería caerse
 * la confirmación — el motor aprende un poco menos, nada más.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'No pude leer los datos.' }, { status: 400 }) }

  const cabecera = b?.cabecera ?? {}
  const lineas: LineaBody[] = Array.isArray(b?.lineas) ? b.lineas : []

  // Validaciones que no se delegan al cliente: el navegador se puede saltear.
  if (!cabecera.tercero_id) return NextResponse.json({ error: 'Falta elegir el proveedor.' }, { status: 400 })
  if (!cabecera.unidad_negocio_id) return NextResponse.json({ error: 'Falta elegir la sucursal compradora.' }, { status: 400 })
  if (!cabecera.numero) return NextResponse.json({ error: 'Falta el número del documento.' }, { status: 400 })
  if (!cabecera.fecha_emision) return NextResponse.json({ error: 'Falta la fecha de emisión.' }, { status: 400 })

  const pendientes = lineas.filter((l) => !l.item_id && l.match_estado !== 'ignorado')
  if (pendientes.length) {
    return NextResponse.json(
      { error: `Quedan ${pendientes.length} renglones sin resolver. Matcheálos o marcálos como ignorados.` },
      { status: 400 },
    )
  }

  const adm = createAdminClient()

  const { data, error } = await adm.rpc('doc_confirmar_documento', {
    p_extraccion_id: params.id,
    p_cabecera: cabecera,
    p_lineas: lineas,
    p_usuario: g.userId,
  })

  if (error) {
    console.error('[documentos] falló la confirmación', error)
    return NextResponse.json({ error: 'No pude guardar el documento. Probá de nuevo.' }, { status: 500 })
  }

  // Aprendizaje: esto es lo que hace que la próxima factura de este proveedor
  // se lea casi sola. Va fuera de la transacción a propósito.
  try {
    await aprenderAliasTercero(
      adm,
      cabecera.tercero_ident_fiscal ?? null,
      cabecera.tercero_nombre_leido ?? null,
      cabecera.tercero_id,
      g.userId,
    )
    for (const l of lineas) {
      if (!l.item_id || l.match_estado === 'ignorado' || l.match_estado === 'automatico') continue
      await aprenderAliasItem(adm, {
        terceroId: cabecera.tercero_id,
        identFiscal: cabecera.tercero_ident_fiscal ?? null,
        codigoTercero: l.codigo_tercero ?? null,
        descripcionTercero: l.descripcion_leida ?? '',
        itemId: l.item_id,
        userId: g.userId,
      })
    }
  } catch (e) {
    console.error('[documentos] el documento se guardó pero falló el aprendizaje de alias', e)
  }

  return NextResponse.json({ ok: true, ...(data as any) })
}
