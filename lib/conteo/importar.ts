import { createAdminClient } from '@/lib/supabase/server'

import type { Ambito } from './esperado'

/**
 * IMPORTAR UNA LISTA DE CONTEO DESDE UNA PLANILLA.
 *
 * ── POR QUÉ NO SALE DEL CATÁLOGO ────────────────────────────────────────────
 *
 * Una zona no es una categoría. "Perfumería góndola 3" tiene items de cinco
 * rubros distintos y le faltan la mitad de los de su rubro. Sacar la lista del
 * catálogo daría una lista que no se parece a lo que hay en el estante, y quien
 * cuenta la abandona en el item veinte.
 *
 * Por eso entra por planilla: la arma quien conoce el estante.
 *
 * ── NADA SE GUARDA SIN QUE ALGUIEN MIRE ─────────────────────────────────────
 *
 * `previsualizar` no escribe. Devuelve qué matcheó, qué no, y qué va a pasar si
 * se confirma. Es el mismo criterio del motor de documentos, y existe porque un
 * import que guarda de una deja la corrección para después — cuando ya hay
 * conteos colgando de la lista mal armada.
 */

/** Una fila de la planilla, ya mapeada a las columnas que importan. */
export interface FilaImportada {
  sku: string | null
  descripcion: string
  unidad: string | null
  /** Si la planilla no lo trae, vale el orden en que vino la fila. */
  orden: number | null
}

export interface ItemPrevisto {
  sku: string | null
  descripcion: string
  unidad: string | null
  orden: number
  /** El item del catálogo, si el SKU matcheó. */
  itemId: string | null
  /** Cómo se leyó esta fila. */
  estado: 'con_catalogo' | 'sin_catalogo' | 'sin_sku' | 'repetido'
  /** Sólo al reimportar. */
  novedad?: 'nuevo' | 'existente'
}

export interface VistaPrevia {
  items: ItemPrevisto[]
  total: number
  conCatalogo: number
  sinCatalogo: number
  sinSku: number
  repetidos: number
  /** Sólo al reimportar una lista que ya existe. */
  reimportacion?: {
    listaId: string
    zona: string
    nuevos: number
    existentes: number
    /** Los que están en la lista y no vinieron en la planilla nueva. */
    desaparecidos: { id: string; sku: string | null; descripcion: string }[]
    /** Conteos ya hechos sobre esta lista: por eso no se borra nada. */
    conteosPrevios: number
  }
}

/** Trim y mayúsculas. El catálogo tiene los 120 SKU así, verificado. */
function normSku(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim().toUpperCase()
  return s === '' ? null : s
}

/**
 * Qué va a pasar si se confirma. NO ESCRIBE NADA.
 *
 * @param listaId Si viene, es una reimportación sobre una lista existente.
 */
export async function previsualizar(
  filas: FilaImportada[],
  listaId?: string | null,
): Promise<VistaPrevia> {
  const adm = createAdminClient()

  // El match es por SKU exacto contra el catálogo. Un item que no matchea NO
  // crea un producto: el SKU es global y un producto nace con confirmación
  // explícita, nunca como efecto secundario de subir una planilla.
  const skus = [...new Set(filas.map((f) => normSku(f.sku)).filter((s): s is string => !!s))]
  const catalogo = new Map<string, string>()
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await adm
      .from('productos_catalogo')
      .select('id, sku')
      .in('sku', skus.slice(i, i + 300))
    for (const p of (data ?? []) as { id: string; sku: string }[]) {
      catalogo.set(normSku(p.sku)!, p.id)
    }
  }

  const vistos = new Set<string>()
  const items: ItemPrevisto[] = filas.map((f, i) => {
    const sku = normSku(f.sku)
    const descripcion = String(f.descripcion ?? '').trim()
    const orden = f.orden ?? i + 1

    let estado: ItemPrevisto['estado']
    if (!sku) estado = 'sin_sku'
    else if (vistos.has(sku)) estado = 'repetido'
    else estado = catalogo.has(sku) ? 'con_catalogo' : 'sin_catalogo'
    if (sku) vistos.add(sku)

    return {
      sku,
      descripcion,
      unidad: f.unidad?.trim() || null,
      orden,
      itemId: sku ? (catalogo.get(sku) ?? null) : null,
      estado,
    }
  })

  const previa: VistaPrevia = {
    items,
    total: items.length,
    conCatalogo: items.filter((x) => x.estado === 'con_catalogo').length,
    sinCatalogo: items.filter((x) => x.estado === 'sin_catalogo').length,
    sinSku: items.filter((x) => x.estado === 'sin_sku').length,
    repetidos: items.filter((x) => x.estado === 'repetido').length,
  }

  if (!listaId) return previa

  /* ── Reimportación: qué cambia sobre lo que ya existe ─────────────────── */
  const [{ data: lista }, { data: actuales }, { count: conteos }] = await Promise.all([
    adm.from('cnt_listas').select('id, zona').eq('id', listaId).maybeSingle(),
    adm.from('cnt_lista_items').select('id, sku, descripcion').eq('lista_id', listaId).eq('activo', true),
    adm.from('cnt_conteos').select('id', { count: 'exact', head: true }).eq('lista_id', listaId),
  ])
  if (!lista) return previa

  const enLista = new Map(
    ((actuales ?? []) as { id: string; sku: string | null; descripcion: string }[]).map((x) => [
      normSku(x.sku) ?? `sin-sku:${x.descripcion.trim().toUpperCase()}`,
      x,
    ]),
  )
  const claveDe = (x: ItemPrevisto) => x.sku ?? `sin-sku:${x.descripcion.toUpperCase()}`
  const clavesNuevas = new Set(items.map(claveDe))

  for (const x of items) x.novedad = enLista.has(claveDe(x)) ? 'existente' : 'nuevo'

  previa.reimportacion = {
    listaId,
    zona: (lista as { zona: string }).zona,
    nuevos: items.filter((x) => x.novedad === 'nuevo').length,
    existentes: items.filter((x) => x.novedad === 'existente').length,
    // No se borran: se marcan. Un item borrado se lleva puestos los renglones
    // de los conteos viejos, y el historial de la zona es justamente lo que
    // convierte el conteo en información.
    desaparecidos: [...enLista.entries()]
      .filter(([k]) => !clavesNuevas.has(k))
      .map(([, v]) => v),
    conteosPrevios: conteos ?? 0,
  }

  return previa
}

/**
 * Guarda lo que la vista previa mostró.
 *
 * Recalcula la previa del lado del servidor en vez de confiar en lo que manda
 * el cliente: si el catálogo cambió entre que se miró y se confirmó, manda lo
 * que hay ahora. Y así el cliente no puede pedir un `itemId` que no le
 * corresponde a ese SKU.
 */
export async function aplicar(args: {
  zona: string
  puntoId: string | null
  descripcion: string | null
  /**
   * Contra qué se va a comparar lo contado. NO tiene default a propósito.
   *
   * Un default invisible acá produce faltantes sistemáticos: una góndola
   * comparada contra el total del punto marca como faltante todo lo que está
   * en el depósito, a tres metros. Alguien iría a buscar mercadería que nunca
   * se perdió. Por eso el tipo lo exige y la ruta lo valida.
   */
  ambito: Ambito
  filas: FilaImportada[]
  listaId?: string | null
  autorId: string
}): Promise<{ ok: true; listaId: string; creados: number; marcados: number } | { ok: false; error: string }> {
  const previa = await previsualizar(args.filas, args.listaId ?? null)
  if (previa.total === 0) return { ok: false, error: 'La planilla no trajo ninguna fila con descripción.' }

  const adm = createAdminClient()
  let listaId = args.listaId ?? null

  if (!listaId) {
    const { data, error } = await adm
      .from('cnt_listas')
      .insert({
        zona: args.zona.trim(),
        punto_id: args.puntoId,
        ambito: args.ambito,
        descripcion: args.descripcion?.trim() || null,
        created_by: args.autorId,
      })
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: 'No se pudo crear la lista.' }
    listaId = (data as { id: string }).id
  }

  // Los repetidos no entran dos veces: el índice único por (lista, sku) lo
  // impediría igual, pero fallar con un error de base sobre una planilla que ya
  // se avisó que traía repetidos sería trasladarle el problema a quien importa.
  const aInsertar = previa.items.filter((x) => x.estado !== 'repetido' && x.novedad !== 'existente')

  let creados = 0
  for (let i = 0; i < aInsertar.length; i += 200) {
    const lote = aInsertar.slice(i, i + 200).map((x) => ({
      lista_id: listaId,
      item_id: x.itemId,
      sku: x.sku,
      descripcion: x.descripcion,
      unidad: x.unidad,
      orden: x.orden,
    }))
    const { data, error } = await adm.from('cnt_lista_items').insert(lote).select('id')
    if (error) return { ok: false, error: `No se pudieron guardar los items: ${error.message}` }
    creados += (data ?? []).length
  }

  // Al reimportar: el orden de los que ya estaban también se actualiza. El
  // recorrido físico cambia cuando alguien mueve una góndola, y una lista con
  // el orden viejo es peor que una lista sin orden.
  let marcados = 0
  if (args.listaId && previa.reimportacion) {
    for (const x of previa.items.filter((y) => y.novedad === 'existente' && y.sku)) {
      await adm
        .from('cnt_lista_items')
        .update({ orden: x.orden, descripcion: x.descripcion, unidad: x.unidad, activo: true })
        .eq('lista_id', args.listaId)
        .eq('sku', x.sku)
    }
    const idsDesaparecidos = previa.reimportacion.desaparecidos.map((d) => d.id)
    if (idsDesaparecidos.length > 0) {
      const { data } = await adm
        .from('cnt_lista_items')
        .update({ activo: false })
        .in('id', idsDesaparecidos)
        .select('id')
      marcados = (data ?? []).length
    }
  }

  return { ok: true, listaId: listaId!, creados, marcados }
}
