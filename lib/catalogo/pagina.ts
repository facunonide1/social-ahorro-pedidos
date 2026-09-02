/**
 * UNA PÁGINA DEL CATÁLOGO, BUSCADA EN LA BASE.
 *
 * ── LO QUE REEMPLAZA ────────────────────────────────────────────────────────
 *
 * Cuatro pantallas traían miles de productos al navegador para filtrar del lado
 * del cliente: stock, catálogo, ofertas y análisis. Con 46.009 productos eso no
 * es una tabla, es una descarga — y encima la tabla se quedaba corta, porque el
 * tope estaba puesto en 5.000 y nadie lo decía.
 *
 * Acá el filtro, el orden, el stock, la reserva y la oferta pasan una vez en la
 * base (`catalogo_pagina`), y vuelven las 50 filas que se muestran **más el
 * total**. El total sale de `count(*) over()` en la misma consulta: no hay una
 * segunda consulta que pueda desincronizarse con la primera.
 *
 * «Mostrando 50 de 46.009» no es un detalle de interfaz: es la diferencia entre
 * informar y mentir.
 */

import { sinDemo } from '@/lib/demo/estado'

type Sb = { rpc: (n: string, a?: any) => any }

export interface FiltrosCatalogo {
  q?: string | null
  categoria?: string | null
  laboratorio?: string | null
  condicion?: string | null
  conStock?: boolean | null
  conOferta?: boolean | null
  soloControlados?: boolean | null
  orden?: 'nombre' | 'sku' | 'stock' | 'precio' | 'ult_venta'
  pagina?: number
  porPagina?: number
}

export interface FilaCatalogo {
  id: string
  sku: string
  codigo_barras: string | null
  nombre: string
  laboratorio: string | null
  categoria: string | null
  condicion_venta: string | null
  canal_abierto: boolean | null
  es_controlado: boolean
  lista_controlado: string | null
  bloqueado_recall: boolean
  precio_sugerido: number | null
  precio_costo_promedio: number | null
  margen_pct: number | null
  /** `null` = SIFACO no declara stock. No es cero. */
  stock: number | null
  reservado: number
  disponible: number | null
  oferta_precio: number | null
  oferta_descuento_pct: number | null
  ult_venta: string | null
  clasificacion_abc: string | null
  seccion: string | null
}

export interface PaginaCatalogo {
  filas: FilaCatalogo[]
  /** Cuántos hay EN TOTAL con estos filtros. Contado en la base. */
  total: number
  pagina: number
  porPagina: number
  paginas: number
}

const POR_PAGINA = 50

export async function paginaDelCatalogo(
  sb: Sb,
  f: FiltrosCatalogo = {},
): Promise<PaginaCatalogo> {
  const porPagina = Math.min(Math.max(f.porPagina ?? POR_PAGINA, 1), 200)
  const pagina = Math.max(f.pagina ?? 1, 1)

  const { data, error } = await sb.rpc('catalogo_pagina', {
    p_q: f.q?.trim() || null,
    p_categoria: f.categoria || null,
    p_laboratorio: f.laboratorio || null,
    p_condicion: f.condicion || null,
    p_con_stock: f.conStock ?? null,
    p_con_oferta: f.conOferta ?? null,
    p_solo_controlados: f.soloControlados ?? null,
    p_orden: f.orden ?? 'nombre',
    p_desde: (pagina - 1) * porPagina,
    p_limite: porPagina,
    p_sin_demo: sinDemo(),
  })
  if (error) throw error

  const filas = (data ?? []) as any[]
  // Sin filas no hay `total`: la consulta no devolvió ninguna, así que hay cero.
  // Eso sí es un cero honesto — se miró y no hay.
  const total = filas.length > 0 ? Number(filas[0].total) : 0

  return {
    filas: filas.map(({ total: _t, ...r }) => ({
      ...r,
      stock: r.stock === null ? null : Number(r.stock),
      reservado: Number(r.reservado ?? 0),
      disponible: r.disponible === null ? null : Number(r.disponible),
      precio_sugerido: r.precio_sugerido === null ? null : Number(r.precio_sugerido),
      precio_costo_promedio: r.precio_costo_promedio === null ? null : Number(r.precio_costo_promedio),
      margen_pct: r.margen_pct === null ? null : Number(r.margen_pct),
      oferta_precio: r.oferta_precio === null ? null : Number(r.oferta_precio),
      oferta_descuento_pct: r.oferta_descuento_pct === null ? null : Number(r.oferta_descuento_pct),
    })) as FilaCatalogo[],
    total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

/**
 * Los productos de una lista de ids, sin traer el catálogo entero.
 *
 * `paginarProductos` traía 46.009 filas sólo para poder poner el nombre al lado
 * de un id. Cuando lo que se necesita son los nombres de 200 productos, se
 * piden esos 200.
 */
export async function productosPorId(
  sb: any,
  ids: string[],
  columnas = 'id, sku, nombre, categoria, laboratorio, precio_sugerido, precio_costo_promedio',
): Promise<Map<string, any>> {
  const mapa = new Map<string, any>()
  const unicos = [...new Set(ids.filter(Boolean))]
  // De a 500: `.in()` con una lista muy larga se corta en 1000 filas sin avisar.
  for (let i = 0; i < unicos.length; i += 500) {
    const { data } = await sb.from('productos_catalogo')
      .select(columnas).in('id', unicos.slice(i, i + 500)).limit(500)
    for (const p of (data ?? []) as any[]) mapa.set(p.id, p)
  }
  return mapa
}
