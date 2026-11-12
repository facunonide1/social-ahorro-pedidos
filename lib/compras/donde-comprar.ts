/**
 * ¿Dónde lo compro más barato?
 *
 * Lee las listas vigentes (lo que dice cada droguería) y las ordena. No escribe.
 * El comparador de listas ya muestra la grilla; esto contesta una pregunta
 * sobre un producto: nombre libre, EAN o código interno.
 */

import { concentracionDe, normalizarTexto, scoreNombre, unidadesDe } from '../drive/match'

export type Consulta = { tipo: 'ean' | 'codigo' | 'texto'; valor: string }

export function parsearConsulta(q: string): Consulta {
  const t = q.trim()
  const digitos = t.replace(/\D/g, '')
  if (/^\d[\d\s-]*$/.test(t) && digitos.length >= 8 && digitos.length <= 14) {
    return { tipo: 'ean', valor: digitos }
  }
  if (/^[A-Za-z0-9][A-Za-z0-9._/-]{1,19}$/.test(t) && /\d/.test(t) && t.length <= 12 && !/\s/.test(t)) {
    return { tipo: 'codigo', valor: t }
  }
  return { tipo: 'texto', valor: t }
}

export type OfertaRankeada = {
  proveedorId: string
  proveedor: string
  precio: number
  precioFinal: number
  esLaMasBarata: boolean
  fechaLista: string | null
  vigente: boolean
  listaVieja: boolean
  dias: number | null
  condiciones: string | null
  bonificacion: string | null
  plazo: string | null
  formaPago: string | null
  origen: string | null
  matchVia: string | null
  matchScore: number | null
}

export type Equivalente = {
  productoId: string
  nombre: string
  relacion: 'mismo EAN' | 'equivalente sugerido'
  motivo: string
}

const MS_DIA = 86_400_000

export function rankearOfertas(
  ofertas: Omit<OfertaRankeada, 'esLaMasBarata' | 'listaVieja' | 'dias'>[],
  ahora: Date,
  diasVieja = 30,
): OfertaRankeada[] {
  const conFecha = ofertas.map((o) => {
    const t = o.fechaLista ? Date.parse(o.fechaLista) : NaN
    const dias = Number.isFinite(t) ? Math.floor((ahora.getTime() - t) / MS_DIA) : null
    return {
      ...o,
      dias,
      listaVieja: dias != null && dias > diasVieja,
      esLaMasBarata: false,
    }
  })
  conFecha.sort((a, b) => a.precioFinal - b.precioFinal)
  if (conFecha[0]) conFecha[0].esLaMasBarata = true
  return conFecha
}

export function equivalentesDe(
  base: { id: string; nombre: string; ean?: string | null; droga?: string | null; presentacion?: string | null },
  catalogo: { id: string; nombre: string; ean?: string | null; droga?: string | null; presentacion?: string | null }[],
): Equivalente[] {
  const out: Equivalente[] = []
  const ean = (base.ean ?? '').replace(/\D/g, '')
  const droga = normalizarTexto(base.droga ?? '')
  const conc = concentracionDe(`${base.nombre} ${base.presentacion ?? ''} ${base.droga ?? ''}`)
  for (const p of catalogo) {
    if (p.id === base.id) continue
    const pean = (p.ean ?? '').replace(/\D/g, '')
    if (ean && pean && ean === pean) {
      out.push({ productoId: p.id, nombre: p.nombre, relacion: 'mismo EAN', motivo: 'Mismo código de barras' })
      continue
    }
    const pconc = concentracionDe(`${p.nombre} ${p.presentacion ?? ''} ${p.droga ?? ''}`)
    const mismaDroga = droga && normalizarTexto(p.droga ?? '') === droga
    const mismaConc = !conc || !pconc || conc === pconc
    const cerca = scoreNombre(base.nombre, p.nombre) >= 0.45
    if (mismaDroga && mismaConc) {
      out.push({
        productoId: p.id,
        nombre: p.nombre,
        relacion: 'equivalente sugerido',
        motivo: `Misma droga${conc ? ` y concentración ${conc}` : ''}`,
      })
    } else if (!droga && cerca && mismaConc) {
      out.push({
        productoId: p.id,
        nombre: p.nombre,
        relacion: 'equivalente sugerido',
        motivo: 'El catálogo no tiene la droga; el nombre se parece',
      })
    }
  }
  return out.slice(0, 8)
}

export function unidadesCoinciden(a: string, b: string): boolean {
  return unidadesDe(a) != null && unidadesDe(a) === unidadesDe(b)
}

export type ProductoBuscado = {
  id: string
  nombre: string
  sku: string | null
  ean: string | null
  droga: string | null
  presentacion: string | null
}

/**
 * Lo que devuelve GET /api/compras/donde-comprar. Puro: la ruta solo busca
 * en la base y le pasa estas listas.
 */
export function armarBusqueda(args: {
  q: string
  productos: ProductoBuscado[]
  ofertas: (Omit<OfertaRankeada, 'esLaMasBarata' | 'listaVieja' | 'dias'> & { productoId?: string })[]
  catalogoEquivalentes: ProductoBuscado[]
  ahora: Date
}) {
  const consulta = parsearConsulta(args.q)
  let producto: ProductoBuscado | null = null
  if (consulta.tipo === 'ean') {
    producto = args.productos.find((p) => (p.ean ?? '').replace(/\D/g, '') === consulta.valor) ?? null
  } else if (consulta.tipo === 'codigo') {
    const c = consulta.valor.toLowerCase()
    producto = args.productos.find((p) => (p.sku ?? '').toLowerCase() === c) ?? null
  }
  if (!producto && args.productos.length) {
    producto = [...args.productos].sort((a, b) => scoreNombre(args.q, b.nombre) - scoreNombre(args.q, a.nombre))[0]
  }
  const ofertas = rankearOfertas(
    producto ? args.ofertas.filter((o) => !o.productoId || o.productoId === producto!.id) : [],
    args.ahora,
  )
  const equivalentes = producto
    ? equivalentesDe(
      { id: producto.id, nombre: producto.nombre, ean: producto.ean, droga: producto.droga, presentacion: producto.presentacion },
      args.catalogoEquivalentes,
    )
    : []
  return { consulta, producto, ofertas, equivalentes }
}
