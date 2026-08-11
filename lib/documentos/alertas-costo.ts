import { emitirAviso } from '@/lib/ai/nora'
import { parametro } from '@/lib/os/definicion'
import {
  DOC_ALERTA_EXCESO_PCT,
  DOC_ALERTA_MONTO_MINIMO,
  DOC_ALERTA_SUBA_PCT,
  DOC_DIAS_DATO_FRESCO,
  DOC_DIAS_VOLUMEN,
  TENANT_ACTUAL,
} from '@/lib/documentos/config'

type Adm = any

/**
 * Reglas de costo que corren al confirmar un documento.
 *
 * Usan el feed de avisos que ya existe (nora_avisos): no hay un sistema
 * paralelo de alertas.
 *
 * Todas hablan con hechos y montos. "Atención: aumento significativo" no le
 * sirve a nadie — no dice cuánto, ni con quién, ni cuánta plata está en juego,
 * así que nadie hace nada con eso.
 */

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const pct = (n: number) => `${n > 0 ? '' : ''}${n.toFixed(0)}%`

/** Corre todas las reglas. Nunca tira: una alerta rota no debe voltear una confirmación. */
export async function evaluarAlertasCosto(adm: Adm, documentoId: string): Promise<void> {
  try {
    await Promise.all([
      alertaAumentoFueraDePatron(adm, documentoId),
      alertaContraLista(adm, documentoId),
      sugerenciaCambioProveedor(adm, documentoId),
    ])
  } catch (e) {
    console.error('[costos] fallaron las alertas del documento', documentoId, e)
  }
}

type LineaDoc = {
  item_id: string
  precio_neto: number
  cantidad: number | null
  sku: string
  nombre: string
}

async function contexto(adm: Adm, documentoId: string) {
  const { data: doc } = await adm
    .from('doc_documentos')
    .select('id, tercero_id, fecha_emision, proveedores:tercero_id(razon_social)')
    .eq('id', documentoId)
    .maybeSingle()
  if (!doc?.tercero_id) return null

  const { data: lineas } = await adm
    .from('doc_lineas')
    .select('item_id, precio_neto, precio_unitario, cantidad, productos_catalogo:item_id(sku, nombre)')
    .eq('documento_id', documentoId)
    .not('item_id', 'is', null)

  const items: LineaDoc[] = ((lineas ?? []) as any[])
    .filter((l) => l.productos_catalogo)
    .map((l) => ({
      item_id: l.item_id,
      precio_neto: Number(l.precio_neto ?? l.precio_unitario),
      cantidad: l.cantidad != null ? Number(l.cantidad) : null,
      sku: l.productos_catalogo.sku,
      nombre: l.productos_catalogo.nombre,
    }))
    .filter((l) => Number.isFinite(l.precio_neto) && l.precio_neto > 0)

  return {
    doc,
    proveedorId: doc.tercero_id as string,
    proveedor: (doc as any).proveedores?.razon_social ?? 'el proveedor',
    items,
  }
}

/**
 * D.1 · Aumento fuera de patrón.
 *
 * Un umbral fijo con inflación se dispara en todo y deja de significar algo:
 * si todo sube 12% por mes, avisar de cada suba mayor a 15% es ruido. Lo que
 * importa no es que aumentó — es que aumentó MÁS QUE EL RESTO de lo que compra
 * ese mismo proveedor en el mismo período.
 *
 * Por eso hay dos condiciones: la suba supera el mínimo Y se despega del
 * promedio del proveedor.
 */
async function alertaAumentoFueraDePatron(adm: Adm, documentoId: string): Promise<void> {
  const ctx = await contexto(adm, documentoId)
  if (!ctx || !ctx.items.length) return

  const itemIds = ctx.items.map((i) => i.item_id)
  const { data: previos } = await adm
    .from('doc_precios_historial')
    .select('item_id, fecha, precio_neto, precio_unitario, cantidad')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('tercero_id', ctx.proveedorId)
    .in('item_id', itemIds)
    .neq('documento_id', documentoId)
    .order('fecha', { ascending: false })
    .limit(2000)

  // Última compra previa de cada producto a ESTE proveedor.
  const anterior = new Map<string, number>()
  for (const p of (previos ?? []) as any[]) {
    if (!anterior.has(p.item_id)) anterior.set(p.item_id, Number(p.precio_neto ?? p.precio_unitario))
  }
  if (!anterior.size) return

  const variaciones = ctx.items
    .filter((i) => anterior.has(i.item_id) && (anterior.get(i.item_id) ?? 0) > 0)
    .map((i) => ({ ...i, previo: anterior.get(i.item_id)!, varPct: ((i.precio_neto - anterior.get(i.item_id)!) / anterior.get(i.item_id)!) * 100 }))

  if (variaciones.length < 2) return

  // La referencia: cuánto se movió el resto de lo que compra este proveedor.
  const promedio = variaciones.reduce((a, v) => a + v.varPct, 0) / variaciones.length

  // La suba mínima puede venir de la declaración de la fábrica. Si el lector
  // está apagado o algo falla, devuelve DOC_ALERTA_SUBA_PCT, que es el valor
  // que este código venía usando: no cambia nada.
  const subaMinima = await parametro('compras', 'alerta_suba_pct', DOC_ALERTA_SUBA_PCT)

  for (const v of variaciones) {
    if (v.varPct < subaMinima) continue
    if (v.varPct - promedio < DOC_ALERTA_EXCESO_PCT) continue

    // Cuánta plata mueve: unidades compradas en la ventana × diferencia.
    const { data: vol } = await adm
      .from('doc_precios_historial')
      .select('cantidad')
      .eq('tenant_id', TENANT_ACTUAL)
      .eq('item_id', v.item_id)
      .gte('fecha', new Date(Date.now() - DOC_DIAS_VOLUMEN * 86_400_000).toISOString().slice(0, 10))

    const unidades = ((vol ?? []) as any[]).reduce((a, x) => a + Number(x.cantidad ?? 0), 0)
    const impacto = (v.precio_neto - v.previo) * unidades

    await emitirAviso(adm, {
      tipo: 'costo_aumento',
      severidad: impacto >= DOC_ALERTA_MONTO_MINIMO ? 'alerta' : 'sugerencia',
      titulo: `${v.nombre} subió ${pct(v.varPct)} con ${ctx.proveedor}`,
      detalle:
        `Pasó de ${fmt(v.previo)} a ${fmt(v.precio_neto)} el neto por unidad. ` +
        `El resto de lo que le comprás a ${ctx.proveedor} se movió ${pct(promedio)} en el mismo período. ` +
        (unidades > 0
          ? `Compraste ${unidades.toLocaleString('es-AR')} unidades en ${DOC_DIAS_VOLUMEN} días: la diferencia son ${fmt(impacto)}.`
          : 'Todavía no hay volumen cargado en el período para estimar el impacto.'),
      modulo: 'compras',
      accionLabel: 'Ver costos del producto',
      accionHref: `/admin/compras/costos/${v.item_id}`,
      entidadRef: { documento_id: documentoId, item_id: v.item_id },
      claveDedup: `costo_aumento:${documentoId}:${v.item_id}`,
    })
  }
}

/**
 * D.2 · Diferencia contra lo pactado.
 *
 * Si hay lista vigente de ese proveedor y la factura vino más cara, es plata
 * que se paga de más sin que nadie lo mire. Es la que más se acumula a fin de
 * año porque cada caso solo es unos pesos.
 */
async function alertaContraLista(adm: Adm, documentoId: string): Promise<void> {
  const ctx = await contexto(adm, documentoId)
  if (!ctx || !ctx.items.length) return

  const { data: lista } = await adm
    .from('listas_precios')
    .select('id')
    .eq('proveedor_id', ctx.proveedorId)
    .eq('vigente', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lista) return

  const { data: items } = await adm
    .from('listas_precios_items')
    .select('producto_id, precio')
    .eq('lista_id', lista.id)
    .in('producto_id', ctx.items.map((i) => i.item_id))

  const pactado = new Map<string, number>()
  for (const i of (items ?? []) as any[]) {
    if (i.producto_id) pactado.set(i.producto_id, Number(i.precio))
  }
  if (!pactado.size) return

  const caros = ctx.items
    .filter((i) => (pactado.get(i.item_id) ?? 0) > 0 && i.precio_neto > pactado.get(i.item_id)!)
    .map((i) => ({ ...i, pactado: pactado.get(i.item_id)!, dif: i.precio_neto - pactado.get(i.item_id)! }))

  if (!caros.length) return

  const total = caros.reduce((a, c) => a + c.dif * (c.cantidad ?? 0), 0)

  await emitirAviso(adm, {
    tipo: 'costo_sobre_lista',
    severidad: total >= DOC_ALERTA_MONTO_MINIMO ? 'alerta' : 'sugerencia',
    titulo: `${caros.length} producto${caros.length === 1 ? '' : 's'} vino${caros.length === 1 ? '' : 'eron'} más caro${caros.length === 1 ? '' : 's'} que la lista de ${ctx.proveedor}`,
    detalle:
      caros
        .slice(0, 5)
        .map((c) => `${c.nombre}: lista ${fmt(c.pactado)}, facturado ${fmt(c.precio_neto)} (+${fmt(c.dif)} por unidad × ${c.cantidad ?? 0})`)
        .join(' · ') +
      (caros.length > 5 ? ` · y ${caros.length - 5} más.` : '') +
      ` En esta factura la diferencia total es ${fmt(total)}.`,
    modulo: 'compras',
    accionLabel: 'Ver el documento',
    accionHref: `/admin/finanzas/documentos/${documentoId}`,
    entidadRef: { documento_id: documentoId },
    claveDedup: `costo_sobre_lista:${documentoId}`,
  })
}

/**
 * D.3 · Conviene cambiar de proveedor.
 *
 * Sugerencia, no alerta: no hay nada mal hecho, hay una oportunidad. Solo se
 * emite si el otro proveedor tiene dato fresco y la plata en juego justifica
 * interrumpir a alguien.
 */
async function sugerenciaCambioProveedor(adm: Adm, documentoId: string): Promise<void> {
  const ctx = await contexto(adm, documentoId)
  if (!ctx || !ctx.items.length) return

  // La misma ventana que usa el comparador, resuelta por la fábrica con el
  // valor del código como fallback.
  const diasFresco = await parametro('compras', 'dias_ventana_costo', DOC_DIAS_DATO_FRESCO)
  const desde = new Date(Date.now() - diasFresco * 86_400_000).toISOString().slice(0, 10)
  const { data: otros } = await adm
    .from('doc_precios_historial')
    .select('item_id, tercero_id, fecha, precio_neto, precio_unitario, proveedores:tercero_id(razon_social)')
    .eq('tenant_id', TENANT_ACTUAL)
    .in('item_id', ctx.items.map((i) => i.item_id))
    .neq('tercero_id', ctx.proveedorId)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(2000)

  const mejor = new Map<string, { neto: number; proveedor: string; fecha: string }>()
  for (const o of (otros ?? []) as any[]) {
    const n = Number(o.precio_neto ?? o.precio_unitario)
    const actual = mejor.get(o.item_id)
    if (!actual || n < actual.neto) {
      mejor.set(o.item_id, { neto: n, proveedor: o.proveedores?.razon_social ?? 'otro proveedor', fecha: o.fecha })
    }
  }
  if (!mejor.size) return

  for (const i of ctx.items) {
    const m = mejor.get(i.item_id)
    if (!m || m.neto >= i.precio_neto) continue

    const { data: vol } = await adm
      .from('doc_precios_historial')
      .select('cantidad')
      .eq('tenant_id', TENANT_ACTUAL)
      .eq('item_id', i.item_id)
      .gte('fecha', new Date(Date.now() - DOC_DIAS_VOLUMEN * 86_400_000).toISOString().slice(0, 10))

    const unidades = ((vol ?? []) as any[]).reduce((a, x) => a + Number(x.cantidad ?? 0), 0)
    const impacto = (i.precio_neto - m.neto) * unidades
    if (impacto < DOC_ALERTA_MONTO_MINIMO) continue

    await emitirAviso(adm, {
      tipo: 'costo_mejor_proveedor',
      severidad: 'sugerencia',
      titulo: `${m.proveedor} tiene ${i.nombre} a ${fmt(m.neto)}`,
      detalle:
        `Le pagaste ${fmt(i.precio_neto)} a ${ctx.proveedor} y ${m.proveedor} lo facturó a ${fmt(m.neto)} el ${m.fecha}. ` +
        `Sobre las ${unidades.toLocaleString('es-AR')} unidades que compraste en ${DOC_DIAS_VOLUMEN} días, la diferencia son ${fmt(impacto)}. ` +
        'No contempla plazo de pago ni mínimo de compra.',
      modulo: 'compras',
      accionLabel: 'Comparar costos',
      accionHref: `/admin/compras/costos/${i.item_id}`,
      entidadRef: { documento_id: documentoId, item_id: i.item_id },
      claveDedup: `costo_mejor_prov:${i.item_id}:${m.proveedor}`,
    })
  }
}
