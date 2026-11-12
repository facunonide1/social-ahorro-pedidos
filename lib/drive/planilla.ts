/**
 * La planilla «Compras y precios por droguería» es la fuente que ya armó el
 * dueño. Tres pestañas importan: listas (al comparador), compras (líneas
 * históricas) y archivos cargados (para no bajar de nuevo lo que ya está).
 */

import { createHash } from 'node:crypto'

import { parsearPrecio, type FilaLista } from './listas'

export type FilaCompra = {
  fecha: string | null
  drogueria: string
  comprobante: string | null
  sucursal: string | null
  producto: string
  droga: string | null
  concentracion: string | null
  unidades: string | null
  codigoBarras: string | null
  cantidad: number | null
  precioCaja: number | null
  descuento: number | null
  precioNeto: number | null
  subtotal: number | null
  observaciones: string | null
}

export type ArchivoCubierto = { nombre: string; fileId: string; comprobante: string | null; notas: string | null }

export type Planilla = {
  precios: { proveedor: string; filas: FilaLista[]; vigenteDesde: string | null; condiciones: string | null }[]
  compras: FilaCompra[]
  archivos: ArchivoCubierto[]
}

function txt(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

function fechaDe(v: unknown): string | null {
  const s = txt(v)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

function idx(header: string[], re: RegExp): number {
  return header.findIndex((h) => re.test(h.toLowerCase()))
}

export function parsearPestanaPrecios(filas: unknown[][]): Planilla['precios'] {
  if (!filas.length) return []
  const h = filas[0].map((c) => txt(c).toLowerCase())
  const iFecha = idx(h, /vigente/)
  const iProv = idx(h, /laboratorio|proveedor/)
  const iNom = idx(h, /^producto$|producto/)
  const iDroga = idx(h, /^droga$/)
  const iConc = idx(h, /concentr/)
  const iUni = idx(h, /unidades/)
  const iEan = idx(h, /barras|ean/)
  const iPrecio = idx(h, /precio por caja$|precio por caja /)
  const iDesc = idx(h, /descuento/)
  const iCond = idx(h, /condiciones/)
  const porProv = new Map<string, { filas: FilaLista[]; vigenteDesde: string | null; condiciones: string | null }>()
  for (const f of filas.slice(1)) {
    const proveedor = txt(f[iProv])
    const nombre = txt(f[iNom])
    const precio = parsearPrecio(f[iPrecio])
    if (!proveedor || !nombre || precio == null) continue
    const g = porProv.get(proveedor) ?? { filas: [], vigenteDesde: fechaDe(f[iFecha]), condiciones: txt(f[iCond]) || null }
    g.filas.push({
      nombre,
      precio,
      categoria: null,
      sku: null,
      droga: txt(f[iDroga]) || null,
      concentracion: txt(f[iConc]) || null,
      unidades: txt(f[iUni]) || null,
      descuento: parsearPrecio(f[iDesc]),
      condiciones: txt(f[iCond]) || null,
      codigoBarras: txt(f[iEan]) || null,
    })
    porProv.set(proveedor, g)
  }
  return [...porProv.entries()].map(([proveedor, g]) => ({ proveedor, ...g }))
}

export function parsearPestanaCompras(filas: unknown[][]): FilaCompra[] {
  if (!filas.length) return []
  const h = filas[0].map((c) => txt(c).toLowerCase())
  const i = (re: RegExp) => idx(h, re)
  const out: FilaCompra[] = []
  for (const f of filas.slice(1)) {
    const producto = txt(f[i(/producto/)])
    const drogueria = txt(f[i(/droguer/)])
    if (!producto || !drogueria) continue
    if (/revisar/i.test(drogueria)) continue
    out.push({
      fecha: fechaDe(f[i(/fecha/)]),
      drogueria,
      comprobante: txt(f[i(/n[°º]\s*factura|comprobante/)]) || null,
      sucursal: txt(f[i(/sucursal/)]) || null,
      producto,
      droga: txt(f[i(/^droga$/)]) || null,
      concentracion: txt(f[i(/concentr/)]) || null,
      unidades: txt(f[i(/unidades/)]) || null,
      codigoBarras: txt(f[i(/barras|ean/)]) || null,
      cantidad: parsearPrecio(f[i(/cantidad/)]),
      precioCaja: parsearPrecio(f[i(/precio por caja/)]),
      descuento: parsearPrecio(f[i(/descuento/)]),
      precioNeto: parsearPrecio(f[i(/precio neto/)]),
      subtotal: parsearPrecio(f[i(/subtotal/)]),
      observaciones: txt(f[i(/observ/)]) || null,
    })
  }
  return out
}

export function parsearArchivosCargados(filas: unknown[][]): ArchivoCubierto[] {
  if (!filas.length) return []
  const h = filas[0].map((c) => txt(c).toLowerCase())
  const iId = idx(h, /id del archivo|^id$/)
  const iNom = idx(h, /archivo/)
  const iComp = idx(h, /comprobante/)
  const iNotas = idx(h, /notas/)
  const out: ArchivoCubierto[] = []
  for (const f of filas.slice(1)) {
    const fileId = txt(f[iId])
    if (!fileId) continue
    out.push({
      nombre: txt(f[iNom]),
      fileId,
      comprobante: txt(f[iComp]) || null,
      notas: txt(f[iNotas]) || null,
    })
  }
  return out
}

export function hashEstable(valor: unknown): string {
  return createHash('sha256').update(JSON.stringify(valor)).digest('hex')
}
