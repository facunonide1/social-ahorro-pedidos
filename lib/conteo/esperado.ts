import { createAdminClient } from '@/lib/supabase/server'

import type { Ambito } from './ambito'

/**
 * LO QUE EL SISTEMA ESPERABA, RESUELTO AL CERRAR Y NUNCA ANTES.
 *
 * Este archivo es el único del motor de conteo que sabe cómo está guardado el
 * stock en ESTA instalación. Si la pieza viaja al catálogo, es el archivo que
 * se reemplaza: el resto no conoce `stock_items` ni la separación entre góndola
 * y depósito.
 *
 * ── POR QUÉ EL ÁMBITO ───────────────────────────────────────────────────────
 *
 * Acá el stock está separado en góndola y depósito. Contar una góndola y
 * compararla contra el total del punto da faltantes sistemáticos que no
 * existen: lo que "falta" está en el depósito, a tres metros. Por eso la lista
 * declara contra qué se compara.
 *
 * ── LA VALORIZACIÓN ─────────────────────────────────────────────────────────
 *
 * Con `precio_sugerido`, que es el precio de venta y es con lo que ya valoriza
 * `calcular_irregularidades_stock`. No es el criterio más conservador —el costo
 * lo sería— pero que los dos números salgan de la misma base es lo que permite
 * sumarlos; dos valorizaciones distintas en la misma pantalla se leen como un
 * error de cuentas.
 */

export type { Ambito } from './ambito'
export { AMBITOS, AMBITO_TEXTO } from './ambito'

export interface Esperado {
  /** null = no se puede saber: sin SKU, sin producto del catálogo, o sin fila de stock. */
  cantidad: number | null
  precio: number
  motivo?: string
}

/**
 * Resuelve la cantidad esperada de cada item de un conteo.
 *
 * @returns mapa `lista_item_id` → esperado. Un item ausente del mapa nunca pasa:
 *          siempre devuelve una entrada, con `cantidad: null` y el motivo si no
 *          se pudo. Un faltante silencioso se leería como un cero, y un cero
 *          esperado contra 12 contadas es un sobrante inventado.
 */
export async function resolverEsperado(args: {
  listaItemIds: string[]
  puntoId: string | null
  ambito: Ambito
}): Promise<Map<string, Esperado>> {
  const adm = createAdminClient()
  const salida = new Map<string, Esperado>()
  if (args.listaItemIds.length === 0) return salida

  const { data: items } = await adm
    .from('cnt_lista_items')
    .select('id, item_id, sku')
    .in('id', args.listaItemIds)

  const filas = (items ?? []) as { id: string; item_id: string | null; sku: string | null }[]
  const productoIds = [...new Set(filas.map((f) => f.item_id).filter((x): x is string => !!x))]

  // Sin punto no hay contra qué comparar: el stock vive por punto. Se dice, no
  // se asume un punto cualquiera.
  if (!args.puntoId) {
    for (const f of filas) {
      salida.set(f.id, { cantidad: null, precio: 0, motivo: 'El conteo no tiene punto: el stock se guarda por punto.' })
    }
    return salida
  }

  const stock = new Map<string, { gondola: number; deposito: number; total: number }>()
  const precios = new Map<string, number>()
  for (let i = 0; i < productoIds.length; i += 300) {
    const trozo = productoIds.slice(i, i + 300)
    const [{ data: st }, { data: pc }] = await Promise.all([
      adm
        .from('stock_items')
        .select('producto_id, cantidad, cantidad_gondola, cantidad_deposito')
        .eq('sucursal_id', args.puntoId)
        .in('producto_id', trozo),
      adm.from('productos_catalogo').select('id, precio_sugerido').in('id', trozo),
    ])
    for (const r of (st ?? []) as {
      producto_id: string
      cantidad: number | null
      cantidad_gondola: number | null
      cantidad_deposito: number | null
    }[]) {
      stock.set(r.producto_id, {
        gondola: Number(r.cantidad_gondola ?? 0),
        deposito: Number(r.cantidad_deposito ?? 0),
        total: Number(r.cantidad ?? 0),
      })
    }
    for (const r of (pc ?? []) as { id: string; precio_sugerido: number | null }[]) {
      precios.set(r.id, Number(r.precio_sugerido ?? 0))
    }
  }

  for (const f of filas) {
    if (!f.item_id) {
      salida.set(f.id, {
        cantidad: null,
        precio: 0,
        motivo: f.sku
          ? 'El SKU no está en el catálogo: no hay stock contra qué comparar.'
          : 'El item vino sin SKU: no hay con qué buscarlo.',
      })
      continue
    }
    const s = stock.get(f.item_id)
    if (!s) {
      // NO es cero. Que el producto exista y no tenga fila de stock en este
      // punto significa que nunca se cargó, no que haya cero unidades.
      salida.set(f.id, {
        cantidad: null,
        precio: precios.get(f.item_id) ?? 0,
        motivo: 'El producto no tiene stock cargado en este punto.',
      })
      continue
    }
    salida.set(f.id, {
      cantidad: args.ambito === 'gondola' ? s.gondola : args.ambito === 'deposito' ? s.deposito : s.total,
      precio: precios.get(f.item_id) ?? 0,
    })
  }

  return salida
}
