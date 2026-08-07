import { DOC_CONC_VENTANA_DIAS, TENANT_ACTUAL } from '@/lib/documentos/config'

type Adm = any

export type OrdenCandidata = {
  ordenId: string
  codigo: string | null
  fecha: string
  total: number
  estado: string
  /** Cuántos SKU del documento están en la orden. */
  itemsEnComun: number
  itemsDocumento: number
  /** 0 a 1. Es lo que se muestra como porcentaje de coincidencia. */
  coincidencia: number
  diasDeDiferencia: number
  yaVinculada: boolean
}

/**
 * Órdenes que podrían corresponder a un documento.
 *
 * Sugiere, nunca vincula: quien carga la factura sabe cosas que el sistema no
 * (que ese remito era del pedido de urgencia, que la orden se anuló por
 * teléfono). Vincular solo y equivocarse genera diferencias fantasma que
 * después alguien tiene que investigar.
 */
export async function ordenesCandidatas(adm: Adm, documentoId: string): Promise<OrdenCandidata[]> {
  const { data: doc } = await adm
    .from('doc_documentos')
    .select('id, tercero_id, fecha_emision, tipo')
    .eq('id', documentoId)
    .maybeSingle()

  if (!doc?.tercero_id) return []

  const { data: lineas } = await adm
    .from('doc_lineas')
    .select('item_id')
    .eq('documento_id', documentoId)
    .not('item_id', 'is', null)

  const itemsDoc = new Set(((lineas ?? []) as any[]).map((l) => l.item_id))
  const fechaDoc = doc.fecha_emision ? new Date(doc.fecha_emision + 'T00:00:00') : new Date()
  const desde = new Date(fechaDoc.getTime() - DOC_CONC_VENTANA_DIAS * 86_400_000).toISOString()

  // La orden tiene que ser ANTERIOR al documento: no se entrega lo que todavía
  // no se pidió. Se deja un día de gracia por cargas del mismo día.
  const hasta = new Date(fechaDoc.getTime() + 86_400_000).toISOString()

  const { data: ordenes } = await adm
    .from('ordenes_compra')
    .select('id, codigo, estado, total_estimado, created_at, orden_compra_items(producto_id)')
    .eq('proveedor_id', doc.tercero_id)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })
    .limit(50)

  // Las que ya están vinculadas se muestran igual, marcadas: puede que la
  // misma orden reciba un segundo remito, y esconderla sería el error.
  const { data: yaVinc } = await adm
    .from('doc_conciliacion_ordenes')
    .select('orden_id, conciliacion_id')

  const vinculadas = new Set(((yaVinc ?? []) as any[]).map((v) => v.orden_id))

  const out: OrdenCandidata[] = ((ordenes ?? []) as any[]).map((o) => {
    const itemsOrden = new Set(((o.orden_compra_items ?? []) as any[]).map((i: any) => i.producto_id).filter(Boolean))
    let comun = 0
    for (const i of itemsDoc) if (itemsOrden.has(i)) comun++

    const dias = Math.abs(Math.round((fechaDoc.getTime() - new Date(o.created_at).getTime()) / 86_400_000))

    // El solapamiento manda; la proximidad de fecha desempata.
    const base = itemsDoc.size ? comun / itemsDoc.size : 0
    const penalidadFecha = Math.min(0.2, (dias / DOC_CONC_VENTANA_DIAS) * 0.2)

    return {
      ordenId: o.id,
      codigo: o.codigo,
      fecha: String(o.created_at).slice(0, 10),
      total: Number(o.total_estimado ?? 0),
      estado: o.estado,
      itemsEnComun: comun,
      itemsDocumento: itemsDoc.size,
      coincidencia: +Math.max(0, base - penalidadFecha).toFixed(3),
      diasDeDiferencia: dias,
      yaVinculada: vinculadas.has(o.id),
    }
  })

  return out
    .filter((o) => o.itemsEnComun > 0 || o.diasDeDiferencia <= 7)
    .sort((a, b) => b.coincidencia - a.coincidencia || a.diasDeDiferencia - b.diasDeDiferencia)
    .slice(0, 8)
}

/**
 * Crea o extiende una conciliación vinculando documentos y órdenes.
 *
 * `sinOrden` cubre la compra directa, que en perfumería y supermercado es la
 * mayoría: se compra al viajante sin orden previa. Sin esa salida, la bandeja
 * se llenaría de casos imposibles de cerrar.
 */
export async function vincular(
  adm: Adm,
  args: {
    documentoId: string
    rol: 'remito' | 'factura' | 'nota_credito'
    ordenIds: string[]
    conciliacionId?: string | null
    sinOrden?: boolean
    userId: string | null
  },
): Promise<{ conciliacionId: string }> {
  const { data: doc } = await adm
    .from('doc_documentos')
    .select('id, tercero_id, unidad_negocio_id')
    .eq('id', args.documentoId)
    .maybeSingle()

  let concId = args.conciliacionId ?? null

  // Si alguna orden ya está en una conciliación, se usa esa: es la misma compra.
  if (!concId && args.ordenIds.length) {
    const { data: ya } = await adm
      .from('doc_conciliacion_ordenes')
      .select('conciliacion_id')
      .in('orden_id', args.ordenIds)
      .limit(1)
      .maybeSingle()
    concId = ya?.conciliacion_id ?? null
  }

  if (!concId) {
    const { data: nueva, error } = await adm
      .from('doc_conciliaciones')
      .insert({
        estado: 'abierta',
        proveedor_id: doc?.tercero_id ?? null,
        sucursal_id: doc?.unidad_negocio_id ?? null,
        nota: args.sinOrden ? 'Compra directa: sin orden de compra previa.' : null,
        created_by: args.userId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    concId = nueva.id as string
  }

  await adm
    .from('doc_conciliacion_documentos')
    .upsert(
      { conciliacion_id: concId, documento_id: args.documentoId, rol: args.rol, created_by: args.userId },
      { onConflict: 'conciliacion_id,documento_id' },
    )

  if (args.ordenIds.length) {
    await adm
      .from('doc_conciliacion_ordenes')
      .upsert(args.ordenIds.map((orden_id) => ({ conciliacion_id: concId, orden_id })), {
        onConflict: 'conciliacion_id,orden_id',
      })
  }

  return { conciliacionId: concId! }
}
