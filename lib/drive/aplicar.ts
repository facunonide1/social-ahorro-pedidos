import { createHash } from 'node:crypto'

import * as XLSX from 'xlsx'

import { paginar } from '@/lib/supabase/paginar'
import { detectarCodificacion } from '@/lib/sifaco/codificacion'
import { FILA_PRIMER_DATO } from '@/lib/sifaco/columnas'
import { normalizarFila } from '@/lib/sifaco/fila'
import { resolverMesesMaestro } from '@/lib/sifaco/meses-maestro'
import { subirDocumento } from '@/lib/documentos/subida'
import { prepararRevision } from '@/lib/documentos/preparar-revision'

import { umbralMatchLista, umbralScoreNombre, preciosAutoAplicar } from './flag'
import { TOPE_BYTES } from './lote'
import { parsearFacturaTexto } from './facturas-texto'
import { parsearGrilla, parsearMayorsur, type FilaLista, type ListaParseada } from './listas'
import {
  prepararFilasCompra, type ContextoMatchCompra, type MapeoNombre,
} from './compras-match'
import { claveNombre, matchearProducto, porcentajeMatch, type ProductoRef } from './match'
import {
  hashEstable, parsearArchivosCargados, parsearPestanaCompras, parsearPestanaPrecios, type FilaCompra,
} from './planilla'
import { sucursalDeArchivo, type ProveedorRef } from './proveedor'
import { mapeoSeccionSiExiste, proveedorPorAliasOSeccion, type MapeoSeccion } from './seccion'

type Adm = any

const LOTE = 400

export async function catalogoMatch(adm: Adm): Promise<ProductoRef[]> {
  const { filas } = await paginar<any>(adm.from('productos_catalogo')
    .select('id, sku, nombre, codigo_barras, droga_principal, presentacion')
    .eq('activo', true).eq('es_demo', false).order('sku'), { maximo: 200_000 })
  return filas.map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    sku: p.sku,
    codigoBarras: p.codigo_barras,
    droga: p.droga_principal,
    presentacion: p.presentacion,
  }))
}

export async function proveedoresActivos(adm: Adm): Promise<ProveedorRef[]> {
  const { data } = await adm.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social').limit(500)
  return ((data ?? []) as any[]).map((p) => ({ id: p.id, razonSocial: p.razon_social }))
}

/** Códigos de `producto_codigos_barras`, tal como están. El cruce los normaliza. */
export async function barrasDelCatalogo(adm: Adm): Promise<Map<string, string>> {
  const { filas } = await paginar<{ codigo: string; producto_id: string }>(
    adm.from('producto_codigos_barras').select('codigo, producto_id').order('codigo').order('producto_id'),
    { maximo: 200_000 },
  )
  return new Map(filas.map((f) => [f.codigo, f.producto_id]))
}

export async function mapeosGuardados(adm: Adm): Promise<MapeoNombre[]> {
  const { filas } = await paginar<{ nombre_norm: string; producto_id: string; proveedor_id: string | null }>(
    adm.from('drive_mapeo_productos').select('nombre_norm, producto_id, proveedor_id').order('nombre_norm').order('id'),
    { maximo: 20_000 },
  )
  return filas.map((m) => ({
    nombreNorm: m.nombre_norm,
    productoId: m.producto_id,
    proveedorId: m.proveedor_id,
  }))
}

async function enTandas(filas: any[], fn: (tanda: any[]) => Promise<void>) {
  for (let i = 0; i < filas.length; i += LOTE) await fn(filas.slice(i, i + LOTE))
}

export async function aplicarLista(adm: Adm, opts: {
  proveedorId: string
  archivoNombre: string
  hash: string
  filas: (FilaLista & { productoId: string | null; score: number; via: string })[]
  usuarioId: string | null
}): Promise<{ listaId: string; anteriorId: string | null; yaEstaba: boolean }> {
  const rubro = 'farmacia'
  const { data: vigente } = await adm.from('listas_precios')
    .select('id, hash').eq('proveedor_id', opts.proveedorId).eq('rubro', rubro).eq('vigente', true).limit(5)
  const misma = ((vigente ?? []) as any[]).find((l) => l.hash === opts.hash)
  if (misma) return { listaId: misma.id, anteriorId: null, yaEstaba: true }
  const anteriorId = (vigente ?? [])[0]?.id ?? null
  if (anteriorId) {
    await adm.from('listas_precios').update({ vigente: false }).eq('proveedor_id', opts.proveedorId).eq('rubro', rubro).eq('vigente', true)
  }
  const { data: lista, error } = await adm.from('listas_precios').insert({
    proveedor_id: opts.proveedorId,
    rubro,
    archivo_nombre: opts.archivoNombre,
    hash: opts.hash,
    vigente: true,
    created_by: opts.usuarioId,
    mapeo_usado: { origen: 'google_drive' },
  }).select('id').single()
  if (error || !lista) throw new Error(error?.message ?? 'no se pudo crear la lista')
  const hoy = new Date().toISOString().slice(0, 10)
  const items = opts.filas.map((f) => ({
    lista_id: lista.id,
    sku: f.sku,
    codigo: f.codigoBarras,
    descripcion_origen: f.nombre,
    producto_id: f.productoId,
    precio: f.precio,
    desc_volumen: { categoria: f.categoria, condiciones: f.condiciones, descuento: f.descuento },
    fecha: hoy,
    match_score: f.score,
    match_via: f.via,
  }))
  await enTandas(items, async (t) => { await adm.from('listas_precios_items').insert(t) })
  const hist = items.filter((i) => i.producto_id && i.precio > 0).map((i) => ({
    item_id: i.producto_id, tercero_id: opts.proveedorId, precio_unitario: i.precio,
    fecha: hoy, origen: 'lista_precios',
  }))
  await enTandas(hist, async (t) => { if (t.length) await adm.from('doc_precios_historial').insert(t) })
  return { listaId: lista.id, anteriorId, yaEstaba: false }
}

export async function revertirLista(adm: Adm, listaId: string, anteriorId: string | null) {
  await adm.from('listas_precios').delete().eq('id', listaId)
  if (anteriorId) await adm.from('listas_precios').update({ vigente: true }).eq('id', anteriorId)
}

function cruzar(filas: FilaLista[], catalogo: ProductoRef[], mapeos: { nombreNorm: string; productoId: string }[]) {
  const umbral = umbralScoreNombre()
  return filas.map((f) => {
    const nombre = [f.nombre, f.droga, f.concentracion, f.unidades].filter(Boolean).join(' ')
    const m = matchearProducto({ nombre, ean: f.codigoBarras, codigo: f.sku }, catalogo, mapeos, umbral)
    return { ...f, productoId: m.productoId, score: m.score, via: m.via }
  })
}

export async function resolverLista(adm: Adm, opts: {
  lista: ListaParseada
  nombreArchivo: string
  ruta: string | null
  bufferHash: string
  usuarioId: string | null
  catalogo: ProductoRef[]
  proveedores: ProveedorRef[]
  mapeos: { nombreNorm: string; productoId: string; proveedorId: string | null }[]
  secciones?: MapeoSeccion[] | null
}) {
  const prov = proveedorPorAliasOSeccion({
    nombreArchivo: opts.nombreArchivo,
    ruta: opts.ruta,
    pista: opts.lista.proveedorPista,
    encabezado: opts.lista.proveedorPista,
  }, opts.proveedores, opts.secciones ?? null)
  const mapeos = opts.mapeos.filter((m) => !m.proveedorId || m.proveedorId === prov?.id)
  const filas = cruzar(opts.lista.filas, opts.catalogo, mapeos)
  const matchPct = porcentajeMatch(filas)
  const confiable = !!prov && matchPct >= umbralMatchLista() && preciosAutoAplicar()
  if (!confiable) {
    return {
      aplicado: false,
      matchPct,
      proveedorId: prov?.id ?? null,
      motivo: !prov ? 'No identifiqué la droguería: queda en previa.' : `Match ${matchPct}%: queda en previa.`,
      listaId: null as string | null,
      anteriorId: null as string | null,
      sinMatch: filas.filter((f) => f.via === 'sin_match').length,
    }
  }
  const r = await aplicarLista(adm, {
    proveedorId: prov.id,
    archivoNombre: opts.nombreArchivo,
    hash: opts.bufferHash,
    filas,
    usuarioId: opts.usuarioId,
  })
  return {
    aplicado: !r.yaEstaba,
    matchPct,
    proveedorId: prov.id,
    motivo: r.yaEstaba ? 'Esa lista ya estaba vigente.' : `Aplicada. Match ${matchPct}%.`,
    listaId: r.listaId,
    anteriorId: r.anteriorId,
    sinMatch: filas.filter((f) => f.via === 'sin_match').length,
  }
}

export async function contextoMatchCompras(adm: Adm, opts: {
  catalogo?: ProductoRef[]
  barras?: Map<string, string>
  mapeos?: MapeoNombre[]
  secciones?: MapeoSeccion[] | null
} = {}): Promise<ContextoMatchCompra> {
  return {
    catalogo: opts.catalogo ?? await catalogoMatch(adm),
    barras: opts.barras ?? await barrasDelCatalogo(adm),
    mapeos: opts.mapeos ?? await mapeosGuardados(adm),
    secciones: 'secciones' in opts ? opts.secciones ?? null : await mapeoSeccionSiExiste(adm),
    umbral: umbralScoreNombre(),
  }
}

export async function guardarCompras(
  adm: Adm,
  filas: FilaCompra[],
  origen: string,
  origenRef: string,
  proveedores: ProveedorRef[],
  opts: {
    catalogo?: ProductoRef[]
    barras?: Map<string, string>
    mapeos?: MapeoNombre[]
    secciones?: MapeoSeccion[] | null
  } = {},
) {
  const rows = prepararFilasCompra(
    filas, origen, origenRef, proveedores, await contextoMatchCompras(adm, opts),
  )
  let insertadas = 0
  await enTandas(rows, async (t) => {
    const { data, error } = await adm.from('compras_lineas').upsert(t, { onConflict: 'hash_linea', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(error.message)
    insertadas += (data ?? []).length
  })
  return { filas: rows.length, insertadas }
}

export async function guardarMapeo(adm: Adm, opts: { proveedorId: string | null; nombre: string; productoId: string }) {
  const nombre_norm = claveNombre(opts.nombre)
  let borrar = adm.from('drive_mapeo_productos').delete().eq('nombre_norm', nombre_norm)
  borrar = opts.proveedorId ? borrar.eq('proveedor_id', opts.proveedorId) : borrar.is('proveedor_id', null)
  await borrar
  const { error } = await adm.from('drive_mapeo_productos').insert({
    proveedor_id: opts.proveedorId,
    nombre_norm,
    producto_id: opts.productoId,
  })
  if (error) throw new Error(error.message)
  if (opts.proveedorId) {
    await adm.from('listas_precios_items').update({
      producto_id: opts.productoId, match_via: 'mapeo', match_score: 1,
    }).is('producto_id', null).eq('descripcion_origen', opts.nombre)
  }
}

export function leerPlanilla(buf: Buffer) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const hoja = (nombre: string) => {
    const n = wb.SheetNames.find((s) => s.toLowerCase() === nombre.toLowerCase())
    if (!n) return [] as unknown[][]
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null })
  }
  return {
    precios: parsearPestanaPrecios(hoja('Listas de precios')),
    compras: parsearPestanaCompras(hoja('Compras')),
    archivos: parsearArchivosCargados(hoja('Archivos cargados')),
    hash: hashEstable({
      p: hoja('Listas de precios').length,
      c: hoja('Compras').length,
    }),
  }
}

export function leerListaBuffer(buf: Buffer, nombre: string, mime: string): ListaParseada | null {
  if (/\.pdf$/i.test(nombre) || mime === 'application/pdf') return null
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null })
  return parsearGrilla(filas, nombre)
}

export async function textoPdf(buf: Buffer): Promise<string | null> {
  try {
    const mod = await import('pdf-parse')
    const fn = (mod as any).default ?? mod
    const r = await fn(buf)
    return typeof r?.text === 'string' ? r.text : null
  } catch {
    return null
  }
}

export async function ingerirFactura(adm: Adm, opts: {
  buf: Buffer
  nombre: string
  mime: string
  usuarioId: string | null
  proveedores: ProveedorRef[]
}) {
  const esPdf = opts.mime === 'application/pdf' || /\.pdf$/i.test(opts.nombre)
  if (esPdf) {
    const texto = await textoPdf(opts.buf)
    const parsed = texto ? parsearFacturaTexto(texto, opts.nombre) : null
    if (parsed && (parsed.lineas.length || parsed.numero)) {
      const compras: FilaCompra[] = parsed.lineas.map((l) => ({
        fecha: parsed.fecha,
        drogueria: parsed.proveedor ?? 'sin proveedor',
        comprobante: parsed.numero,
        sucursal: parsed.sucursal,
        producto: l.descripcion,
        droga: null,
        concentracion: null,
        unidades: null,
        codigoBarras: l.codigo,
        cantidad: l.cantidad,
        precioCaja: l.precioUnitario,
        descuento: null,
        precioNeto: l.precioUnitario,
        subtotal: l.importe,
        observaciones: 'texto de la factura',
      }))
      const g = await guardarCompras(adm, compras, 'factura_texto', opts.nombre, opts.proveedores)
      return { via: 'texto' as const, ...parsed, ...g }
    }
  }
  const sub = await subirDocumento(adm, { buffer: opts.buf, nombre: opts.nombre, mime: opts.mime || 'application/octet-stream' }, opts.usuarioId, null)
  if (sub.estado === 'error') return { via: 'documento' as const, error: sub.mensaje }
  const id = sub.estado === 'subido' ? sub.extraccionId : sub.extraccionId
  if (sub.estado === 'subido') {
    try { await prepararRevision(adm, id) } catch { /* la foto queda pendiente si el modelo no está */ }
  }
  return { via: 'documento' as const, extraccionId: id, duplicado: sub.estado === 'duplicado' }
}

/** Maestro pla_3d de UNA sucursal. Estaciona y calcula la previa. No aplica. */
export async function estacionarMaestro(adm: Adm, opts: {
  buf: Buffer
  nombre: string
  ruta: string | null
  usuarioId: string | null
}) {
  const sucursal = sucursalDeArchivo(opts.nombre, opts.ruta)
  if (opts.buf.length > TOPE_BYTES) {
    return {
      ok: false as const,
      sucursal,
      motivo: `El maestro pesa ${Math.round(opts.buf.length / 1_048_576)} MB. Esta corrida no lo estaciona (se pasaría de memoria). Quedó marcado como sucursal ${sucursal ?? 'sin detectar'}. Subilo a mano en /admin/operaciones/sifaco. La ingesta no lo aplica.`,
    }
  }
  const hash = createHash('sha256').update(opts.buf).digest('hex')
  const { data: ya } = await adm.from('sifaco_importaciones').select('id, estado').eq('archivo_hash', hash).limit(1).maybeSingle()
  if (ya) return { ok: true as const, sucursal, importacionId: ya.id as string, duplicado: true }

  const wb = XLSX.read(opts.buf, { type: 'buffer', cellDates: false, raw: true })
  const hojaNombre = wb.SheetNames.find((n) => /pla_3d/i.test(n)) ?? wb.SheetNames[0]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hojaNombre], { header: 1, raw: true, defval: null, blankrows: false })
  const meses = resolverMesesMaestro(filas)
  const muestra: string[] = []
  for (let i = FILA_PRIMER_DATO; i < filas.length && muestra.length < 3000; i++) {
    const d = filas[i]?.[0]
    if (typeof d === 'string' && d) muestra.push(d)
  }
  const veredicto = detectarCodificacion(muestra)
  const normalizadas = []
  for (let i = FILA_PRIMER_DATO; i < filas.length; i++) {
    const f = filas[i]
    if (!f) continue
    const n = normalizarFila(f, i, veredicto.codificacion)
    if (n) normalizadas.push(n)
  }
  if (!normalizadas.length) return { ok: false as const, sucursal, motivo: 'No encontré filas de maestro.' }

  const { data: imp, error } = await adm.from('sifaco_importaciones').insert({
    tipo: 'maestro',
    archivo_nombre: opts.nombre,
    archivo_hash: hash,
    bytes: opts.buf.length,
    estado: 'cargando',
    codificacion: veredicto.codificacion,
    codificacion_prueba: { ...veredicto, meses, sucursal, origen: 'google_drive', solo_previa: true },
    filas_declaradas: normalizadas.length,
    subido_por: opts.usuarioId,
  }).select('id').single()
  if (error || !imp) throw new Error(error?.message ?? 'no se abrió la importación')

  let lote = 0
  await enTandas(normalizadas, async (t) => {
    const conId = t.map((f) => ({ ...f, importacion_id: imp.id }))
    const { error: e } = await adm.from('sifaco_maestro_staging').upsert(conId, { onConflict: 'importacion_id,fila' })
    if (e) throw new Error(e.message)
    await adm.from('sifaco_import_lotes').upsert({
      importacion_id: imp.id, lote, desde_fila: t[0].fila, filas: t.length,
    }, { onConflict: 'importacion_id,lote' })
    lote++
  })

  const { data: previa, error: ePre } = await adm.rpc('sifaco_previa_maestro', { p_importacion: imp.id }).maybeSingle()
  if (ePre) throw new Error(ePre.message)
  const previaCon = previa && typeof previa === 'object'
    ? { ...(previa as object), meses, sucursal, solo_previa: true }
    : { meses, sucursal, solo_previa: true }
  await adm.from('sifaco_importaciones').update({
    estado: 'cargado',
    previa: previaCon,
    filas_cargadas: normalizadas.length,
    cargado_at: new Date().toISOString(),
  }).eq('id', imp.id)
  return { ok: true as const, sucursal, importacionId: imp.id as string, duplicado: false, filas: normalizadas.length }
}

export { parsearMayorsur }
