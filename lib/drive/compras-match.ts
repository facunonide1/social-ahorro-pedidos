/**
 * Cruce de una línea de compra con el catálogo.
 *
 * Primero el código de barras, contra `producto_codigos_barras` (un producto
 * puede tener hasta cuatro; `productos_catalogo.codigo_barras` es sólo el
 * principal y entra acá si la tabla no lo trae). Después el mismo
 * `matchearProducto` de las listas: mapeo manual y, si no, nombre con el
 * umbral que ya existe. Debajo del umbral la fila queda sin producto.
 */

import { createHash } from 'node:crypto'

import type { FilaCompra } from './planilla'
import {
  catalogoAcotado, indiceDeNombres, matchearProducto, type ProductoRef, type ResultadoMatch,
} from './match'
import { sucursalDeArchivo, type ProveedorRef } from './proveedor'
import { proveedorPorAliasOSeccion, type MapeoSeccion } from './seccion'

export type MapeoNombre = { nombreNorm: string; productoId: string; proveedorId?: string | null }

export function claveBarras(codigo: string | null | undefined): string | null {
  const claves = clavesBarras(codigo)
  return claves[0] ?? null
}

/** Dígitos, y sin los ceros de la izquierda si el resto sigue siendo un EAN. */
export function clavesBarras(codigo: string | null | undefined): string[] {
  const digitos = (codigo ?? '').replace(/\D/g, '')
  if (digitos.length < 8 || /^0+$/.test(digitos)) return []
  const sinCero = digitos.replace(/^0+/, '')
  if (sinCero.length >= 8 && sinCero !== digitos) return [digitos, sinCero]
  return [digitos]
}

/**
 * La tabla manda. El código principal del catálogo completa los huecos y no
 * pisa un código que ya estaba en la tabla.
 */
export function fusionarBarras(
  tabla: Iterable<[string, string]>,
  catalogo: ProductoRef[],
): Map<string, string> {
  const m = new Map<string, string>()
  const poner = (codigo: string, productoId: string) => {
    for (const k of clavesBarras(codigo)) {
      if (!m.has(k)) m.set(k, productoId)
    }
  }
  for (const [codigo, productoId] of tabla) poner(codigo, productoId)
  for (const p of catalogo) if (p.codigoBarras) poner(p.codigoBarras, p.id)
  return m
}

export function matchearLineaCompra(
  consulta: { nombre?: string | null; ean?: string | null; codigo?: string | null },
  catalogo: ProductoRef[],
  barras: Map<string, string>,
  mapeos: { nombreNorm: string; productoId: string }[],
  umbral: number,
  indice: Map<string, number[]> | null,
): ResultadoMatch {
  for (const k of clavesBarras(consulta.ean)) {
    const id = barras.get(k)
    if (!id) continue
    const hit = catalogo.find((p) => p.id === id)
    return { productoId: id, score: 1, via: 'ean', nombre: hit?.nombre ?? null }
  }

  const nombre = consulta.nombre ?? ''
  let base = indice ? catalogoAcotado(nombre, catalogo, indice) : catalogo
  const codigo = (consulta.codigo ?? '').trim().toLowerCase()
  if (codigo) {
    const porSku = catalogo.find((p) => (p.sku ?? '').trim().toLowerCase() === codigo)
    if (porSku && !base.some((p) => p.id === porSku.id)) base = [porSku, ...base]
  }
  return matchearProducto({ nombre, codigo: consulta.codigo, ean: null }, base, mapeos, umbral)
}

export type ContextoMatchCompra = {
  catalogo: ProductoRef[]
  barras: Map<string, string>
  mapeos: MapeoNombre[]
  umbral: number
  indice?: Map<string, number[]> | null
  /** null: la tabla no está o no se consultó. No es un error. */
  secciones?: MapeoSeccion[] | null
}

export function nombreDeCompra(f: FilaCompra): string {
  return [f.producto, f.droga, f.concentracion, f.unidades].filter(Boolean).join(' ')
}

export type LineaSinProducto = {
  id: string
  proveedor_id: string | null
  producto_nombre: string | null
  droga: string | null
  concentracion: string | null
  unidades: string | null
  codigo_barras: string | null
  producto_id: string | null
  match_score: number | string | null
  match_via: string | null
}

export type UpdateMatch = {
  id: string
  producto_id: string | null
  match_score: number
  match_via: ResultadoMatch['via']
}

/**
 * Qué hay que escribir en un rematch. Una fila que ya tiene producto no se
 * toca. Si el score y la vía ya son los mismos, tampoco: correrlo de nuevo
 * no cambia nada y no borra.
 */
export function updatesDeRematch(filas: LineaSinProducto[], ctx: ContextoMatchCompra): UpdateMatch[] {
  const indice = ctx.indice === undefined ? indiceDeNombres(ctx.catalogo) : ctx.indice
  const barras = fusionarBarras(ctx.barras, ctx.catalogo)
  const out: UpdateMatch[] = []
  for (const f of filas) {
    if (f.producto_id) continue
    const mapeos = ctx.mapeos.filter((m) => !m.proveedorId || m.proveedorId === f.proveedor_id)
    const nombre = [f.producto_nombre, f.droga, f.concentracion, f.unidades].filter(Boolean).join(' ')
    const m = matchearLineaCompra(
      { nombre, ean: f.codigo_barras },
      ctx.catalogo,
      barras,
      mapeos,
      ctx.umbral,
      indice,
    )
    const scoreAntes = f.match_score == null || f.match_score === '' ? null : Number(f.match_score)
    if (f.match_via === m.via && scoreAntes === m.score) continue
    out.push({ id: f.id, producto_id: m.productoId, match_score: m.score, match_via: m.via })
  }
  return out
}

export function prepararFilasCompra(
  filas: FilaCompra[],
  origen: string,
  origenRef: string,
  proveedores: ProveedorRef[],
  ctx: ContextoMatchCompra,
) {
  const indice = ctx.indice === undefined ? indiceDeNombres(ctx.catalogo) : ctx.indice
  const barras = fusionarBarras(ctx.barras, ctx.catalogo)
  return filas.map((f) => {
    const prov = proveedorPorAliasOSeccion(
      { pista: f.drogueria, nombreArchivo: f.drogueria },
      proveedores,
      ctx.secciones ?? null,
    )
    const mapeos = ctx.mapeos.filter((m) => !m.proveedorId || m.proveedorId === prov?.id)
    const m = matchearLineaCompra(
      { nombre: nombreDeCompra(f), ean: f.codigoBarras },
      ctx.catalogo,
      barras,
      mapeos,
      ctx.umbral,
      indice,
    )
    const hash = createHash('sha256').update([
      f.drogueria, f.comprobante, f.producto, f.cantidad, f.precioNeto ?? f.precioCaja,
    ].join('|')).digest('hex')
    return {
      proveedor_id: prov?.id ?? null,
      proveedor_nombre: f.drogueria,
      sucursal_nombre: f.sucursal,
      sucursal_codigo: sucursalDeArchivo(f.sucursal ?? ''),
      comprobante: f.comprobante,
      fecha: f.fecha,
      producto_nombre: f.producto,
      droga: f.droga,
      concentracion: f.concentracion,
      unidades: f.unidades,
      codigo_barras: f.codigoBarras,
      cantidad: f.cantidad,
      precio_unitario: f.precioNeto ?? f.precioCaja,
      descuento_pct: f.descuento,
      importe: f.subtotal,
      producto_id: m.productoId,
      match_score: m.score,
      match_via: m.via,
      origen,
      origen_ref: origenRef,
      hash_linea: hash,
    }
  })
}
