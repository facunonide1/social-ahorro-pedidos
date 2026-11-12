import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/server'

import {
  catalogoMatch, estacionarMaestro, guardarCompras, ingerirFactura,
  leerListaBuffer, leerPlanilla, proveedoresActivos, resolverLista, textoPdf,
} from './aplicar'
import { clasificar, type Clasificacion } from './clasificar'
import { esElMismoContenido } from './dedupe'
import { ingestaHabilitada, MAX_INTENTOS, MAX_PROFUNDIDAD, ARCHIVOS_POR_CORRIDA } from './flag'
import {
  TOPE_BYTES, decisionTrabado, mensajeTope, planificarCorrida, sigueEnPresupuesto,
} from './lote'
import { mapeoSeccionSiExiste } from './seccion'
import { refrescarAccessToken } from './google'
import { fuenteDrive } from './fuente-drive'
import type { FuenteArchivos } from '@/lib/ingesta/fuente'
import { parsearMayorsur } from './listas'
import { claveDesdeEnv, descifrarToken } from './crypto'
import { tomarPagina, tareasIniciales, type TareaCarpeta } from './recorrer'
import { avisoPlazo } from './vencimiento'
import { proximoIntento } from './vencimiento'

type Adm = ReturnType<typeof createAdminClient>

async function avisoVencida(adm: Adm, integracionId: string, connectedAt: string) {
  const clave = `drive:vencida:${integracionId}:${connectedAt}`
  const { data: ya } = await adm.from('nora_avisos').select('id').eq('clave_dedup', clave).eq('estado', 'pendiente').limit(1).maybeSingle()
  if (ya) return
  await adm.from('nora_avisos').insert({
    tipo: 'datos_sin_actualizar',
    severidad: 'alerta',
    titulo: 'Google Drive hay que reconectarlo',
    detalle: 'El permiso de solo lectura venció (la app de Google está en modo Testing: el token dura 7 días). Las listas y las facturas no entran hasta que se reconecte.',
    modulo: 'compras',
    accion_label: 'Reconectar',
    accion_href: '/admin/configuracion/integraciones/google-drive',
    estado: 'pendiente',
    clave_dedup: clave,
  })
}

async function marcarVencida(adm: Adm, row: { id: string; connected_at: string }, mensaje: string) {
  await adm.from('integraciones_google_drive').update({
    estado: 'vencida', last_error: mensaje, updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  await avisoVencida(adm, row.id, row.connected_at)
}

export async function correrIngesta(opts: { manual?: boolean } = {}) {
  const inicio = Date.now()
  if (!ingestaHabilitada()) return { ok: true, omitido: 'deshabilitado' }
  const adm = createAdminClient()
  const { data: conexion } = await adm.from('integraciones_google_drive')
    .select('id, refresh_token_cifrado, iv, tag, estado, connected_at, last_sync_at, listado_cursor, listado_completo, owner_admin_id')
    .order('connected_at', { ascending: false }).limit(1).maybeSingle()
  if (!conexion) return { ok: true, sin_conexion: true }
  if (conexion.estado === 'vencida') return { ok: true, vencida: true }

  if (avisoPlazo(new Date(), new Date(conexion.connected_at)) === 'vencido') {
    await avisoVencida(adm, conexion.id, conexion.connected_at)
  }

  let refresh = ''
  try {
    refresh = descifrarToken({
      cifrado: conexion.refresh_token_cifrado, iv: conexion.iv, tag: conexion.tag,
    }, claveDesdeEnv())
  } catch (e: any) {
    await adm.from('integraciones_google_drive').update({ last_error: e?.message ?? 'no pude leer el token' }).eq('id', conexion.id)
    return { ok: false, error: 'token' }
  }

  const acceso = await refrescarAccessToken(refresh)
  if (!acceso.ok) {
    if (acceso.invalidGrant) await marcarVencida(adm, conexion, 'invalid_grant')
    else await adm.from('integraciones_google_drive').update({ last_error: acceso.error }).eq('id', conexion.id)
    return { ok: false, error: acceso.error, vencida: acceso.invalidGrant }
  }

  const { data: carpetas } = await adm.from('integraciones_google_drive_carpetas')
    .select('folder_id, folder_nombre, incluir_subcarpetas').eq('integracion_id', conexion.id).limit(30)
  if (!carpetas?.length) return { ok: true, sin_carpetas: true }

  // Desde acá la ingesta no sabe que es Drive: lista y baja por la fuente.
  const fuente = fuenteDrive(acceso.accessToken)
  const encolados = await encolar(adm, fuente, conexion, carpetas as any[])
  const procesados = await procesarLote(adm, fuente, conexion.owner_admin_id, inicio)
  return { ok: true, manual: !!opts.manual, ...encolados, ...procesados }
}

async function encolar(adm: Adm, fuente: FuenteArchivos, conexion: any, carpetas: { folder_id: string; folder_nombre: string; incluir_subcarpetas: boolean }[]) {
  let tareas: TareaCarpeta[] = Array.isArray(conexion.listado_cursor?.tareas) ? conexion.listado_cursor.tareas : []
  let desde: string | null = conexion.listado_cursor?.desde ?? null
  if (!tareas.length) {
    desde = conexion.last_sync_at
    tareas = tareasIniciales(carpetas.map((c) => ({
      folderId: c.folder_id,
      folderNombre: c.folder_nombre,
      incluirSubcarpetas: c.incluir_subcarpetas !== false,
    })))
  }
  const vistos = new Set<string>()
  let nuevos = 0
  let paginas = 0
  while (tareas.length && paginas < 3 && nuevos < 40) {
    const paso = await tomarPagina(tareas, (id, page) => fuente.listarPagina(id, page),
      { maxProfundidad: MAX_PROFUNDIDAD, modificadoDespues: desde, vistos })
    tareas = paso.tareas
    paginas++
    nuevos += await guardarPagina(adm, paso.archivos)
  }
  const completo = tareas.length === 0
  await adm.from('integraciones_google_drive').update({
    listado_cursor: completo ? { tareas: [], desde: null } : { tareas, desde },
    listado_completo: completo,
    last_sync_at: completo ? new Date().toISOString() : conexion.last_sync_at,
    updated_at: new Date().toISOString(),
  }).eq('id', conexion.id)
  return { encolados: nuevos, listado_completo: completo }
}

async function guardarPagina(adm: Adm, archivos: { fileId: string; nombre: string; mime: string; modifiedTime: string | null; md5: string | null; webViewLink: string | null; size: number | null; carpetaRaizId: string; carpetaRaizNombre: string; rutaRelativa: string }[]) {
  if (!archivos.length) return 0
  const ids = archivos.map((a) => a.fileId)
  // Si esto falla, NO se sigue: sin `previos`, todo parecería nuevo y se
  // reprocesaría (e insertaría de nuevo) la página entera.
  const { data: previos, error: ePrev } = await adm.from('drive_archivos_ingestados')
    .select('file_id, md5, modified_time, estado').in('file_id', ids).limit(200)
  if (ePrev) throw new Error(`no pude leer qué archivos ya conocía: ${ePrev.message}`)
  const porId = new Map(((previos ?? []) as any[]).map((p) => [p.file_id, p]))
  let n = 0
  for (const a of archivos) {
    const prev = porId.get(a.fileId)
    const clas = clasificar({ nombre: a.nombre, mime: a.mime, ruta: a.rutaRelativa })
    if (prev && esElMismoContenido(
      { fileId: prev.file_id, md5: prev.md5, modifiedTime: prev.modified_time },
      { fileId: a.fileId, md5: a.md5, modifiedTime: a.modifiedTime },
    )) continue
    const fila = {
      file_id: a.fileId,
      nombre: a.nombre,
      mime: a.mime,
      modified_time: a.modifiedTime,
      md5: a.md5,
      web_view_link: a.webViewLink,
      bytes: a.size,
      carpeta_raiz_id: a.carpetaRaizId,
      carpeta_raiz_nombre: a.carpetaRaizNombre,
      ruta_relativa: a.rutaRelativa,
      clasificacion: clas,
      estado: clas === 'ignorar' ? 'ok' : clas === 'sin_clasificar' ? 'sin_clasificar' : 'pendiente',
      intentos: 0,
      proximo_intento_at: null,
      error: null,
      updated_at: new Date().toISOString(),
    }
    const { error: eFila } = prev
      ? await adm.from('drive_archivos_ingestados').update(fila).eq('file_id', a.fileId)
      : await adm.from('drive_archivos_ingestados').insert(fila)
    if (eFila) throw new Error(`no pude encolar ${a.nombre}: ${eFila.message}`)
    n++
  }
  return n
}

async function recuperarTrabados(adm: Adm) {
  const { data, error } = await adm.from('drive_archivos_ingestados')
    .select('id, intentos, updated_at')
    .eq('estado', 'procesando')
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(40)
  if (error) throw new Error(`no pude leer los trabados: ${error.message}`)
  const ahora = new Date()
  let recuperados = 0
  for (const a of (data ?? []) as any[]) {
    const d = decisionTrabado({
      updatedAt: a.updated_at ?? null,
      ahora,
      intentos: Number(a.intentos ?? 0),
      maxIntentos: MAX_INTENTOS,
    })
    if (d.accion === 'esperar') continue
    const estado = d.accion === 'error' ? 'error' : 'pendiente'
    const { error: eUp } = await adm.from('drive_archivos_ingestados').update({
      estado,
      intentos: d.intentos,
      error: d.accion === 'error'
        ? 'Quedó trabado en procesando y se agotaron los intentos.'
        : 'Quedó trabado en procesando. Vuelve a la cola.',
      proximo_intento_at: null,
      updated_at: ahora.toISOString(),
    }).eq('id', a.id)
    if (eUp) throw new Error(`no pude sacar de procesando ${a.id}: ${eUp.message}`)
    recuperados++
  }
  return recuperados
}

async function procesarLote(adm: Adm, fuente: FuenteArchivos, usuarioId: string | null, inicio: number) {
  const recuperados = await recuperarTrabados(adm)
  const { data: cola } = await adm.from('drive_archivos_ingestados')
    .select('id, file_id, nombre, mime, ruta_relativa, clasificacion, clasificacion_forzada, intentos, bytes, web_view_link, proximo_intento_at')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(40)
  const ahoraMs = Date.now()
  const archivos = ((cola ?? []) as any[]).filter((a) => !a.proximo_intento_at || Date.parse(a.proximo_intento_at) <= ahoraMs)
  const plan = planificarCorrida(archivos.map((a) => ({
    ...a,
    bytes: a.bytes == null ? null : Number(a.bytes),
    clasificacionForzada: a.clasificacion_forzada ?? null,
  })), { max: ARCHIVOS_POR_CORRIDA })
  const resultados: { fileId: string; estado: string }[] = []
  for (const archivo of plan.omitidos) {
    const mb = Math.round(Number(archivo.bytes) / 1_048_576)
    const { error: eUp } = await adm.from('drive_archivos_ingestados').update({
      estado: 'previa',
      destino_ref: 'omitido_por_tamano',
      error: mensajeTope(mb),
      updated_at: new Date().toISOString(),
    }).eq('id', archivo.id)
    if (eUp) throw new Error(`no pude pasar a previa ${archivo.file_id}: ${eUp.message}`)
    resultados.push({ fileId: archivo.file_id, estado: 'previa' })
  }
  let cubiertos = new Set<string>()
  for (const archivo of plan.elegir) {
    if (!sigueEnPresupuesto(Date.now() - inicio)) break
    if (cubiertos.has(archivo.file_id)) {
      await adm.from('drive_archivos_ingestados').update({
        estado: 'ok', destino_ref: 'cubierto_por_planilla', error: null,
      }).eq('id', archivo.id)
      resultados.push({ fileId: archivo.file_id, estado: 'ok' })
      continue
    }
    const intentos = Number(archivo.intentos ?? 0) + 1
    await adm.from('drive_archivos_ingestados').update({
      estado: 'procesando', intentos, updated_at: new Date().toISOString(),
    }).eq('id', archivo.id)
    try {
      const r = await procesarUno(adm, fuente, archivo, usuarioId)
      if (r.cubiertos) cubiertos = new Set([...cubiertos, ...r.cubiertos])
      await adm.from('drive_archivos_ingestados').update({
        estado: r.estado,
        clasificacion: r.clasificacion,
        destino_ref: r.destino ?? null,
        error: r.error ?? null,
        match_pct: r.matchPct ?? null,
        proveedor_id: r.proveedorId ?? null,
        lista_id: r.listaId ?? null,
        lista_anterior_id: r.anteriorId ?? null,
        sucursal_codigo: r.sucursal ?? null,
        contenido_hash: r.hash ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', archivo.id)
      resultados.push({ fileId: archivo.file_id, estado: r.estado })
    } catch (e: any) {
      const mensaje = e?.message ?? 'falló'
      const estado = intentos >= MAX_INTENTOS ? 'error' : 'pendiente'
      await adm.from('drive_archivos_ingestados').update({
        estado,
        error: mensaje,
        proximo_intento_at: estado === 'pendiente' ? proximoIntento(intentos).toISOString() : null,
      }).eq('id', archivo.id)
      resultados.push({ fileId: archivo.file_id, estado })
    }
  }
  return { procesados: resultados.length, resultados, recuperados, omitidos: plan.omitidos.length }
}

async function procesarUno(adm: Adm, fuente: FuenteArchivos, archivo: any, usuarioId: string | null): Promise<{
  estado: string
  clasificacion: Clasificacion
  destino?: string | null
  error?: string | null
  matchPct?: number | null
  proveedorId?: string | null
  listaId?: string | null
  anteriorId?: string | null
  sucursal?: string | null
  hash?: string | null
  cubiertos?: string[]
}> {
  const forzada = archivo.clasificacion_forzada as Clasificacion | null
  if (forzada === 'ignorar') return { estado: 'ok', clasificacion: 'ignorar' }
  const buf = await fuente.descargar({ id: archivo.file_id, mime: archivo.mime })
  const hash = createHash('sha256').update(buf).digest('hex')
  if (buf.length > TOPE_BYTES) {
    const clas = forzada ?? clasificar({ nombre: archivo.nombre, mime: archivo.mime, ruta: archivo.ruta_relativa })
    return {
      estado: 'previa',
      clasificacion: clas,
      error: mensajeTope(Math.round(buf.length / 1_048_576)),
      hash,
    }
  }
  let clas = forzada ?? clasificar({ nombre: archivo.nombre, mime: archivo.mime, ruta: archivo.ruta_relativa })
  if (!forzada && (archivo.mime?.includes('spreadsheet') || /\.xls/i.test(archivo.nombre))) {
    // Señales del contenido, sin cambiar un forzado.
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'buffer', sheetRows: 8 })
      const hoja = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: '' })
      const celdas = filas.slice(0, 6).flat().map((c) => String(c ?? ''))
      clas = clasificar({
        nombre: archivo.nombre, mime: archivo.mime, ruta: archivo.ruta_relativa,
        hojas: wb.SheetNames, celdas, encabezados: (filas[0] ?? []).map((c) => String(c ?? '')),
      })
    } catch { /* queda la clase por nombre y ruta */ }
  }

  const proveedores = await proveedoresActivos(adm)
  const { data: mapas } = await adm.from('drive_mapeo_productos')
    .select('nombre_norm, producto_id, proveedor_id').limit(500)
  const mapeos = ((mapas ?? []) as any[]).map((m) => ({
    nombreNorm: m.nombre_norm as string,
    productoId: m.producto_id as string,
    proveedorId: (m.proveedor_id as string | null) ?? null,
  }))

  if (clas === 'planilla' || /compras y precios por droguer/i.test(archivo.nombre)) {
    const planilla = leerPlanilla(buf)
    const catalogo = await catalogoMatch(adm)
    const cubiertos = planilla.archivos.map((a) => a.fileId)
    const secciones = await mapeoSeccionSiExiste(adm)
    await guardarCompras(adm, planilla.compras, 'planilla', archivo.file_id, proveedores, {
      catalogo, mapeos, secciones,
    })
    let aplicadas = 0
    let enPrevia = 0
    for (const grupo of planilla.precios) {
      const lista = {
        formato: 'planilla' as const,
        proveedorPista: grupo.proveedor,
        vigenteDesde: grupo.vigenteDesde,
        ivaIncluido: null,
        filas: grupo.filas,
        titulosCategoria: 0,
      }
      const r = await resolverLista(adm, {
        lista, nombreArchivo: `${archivo.nombre} · ${grupo.proveedor}`, ruta: archivo.ruta_relativa,
        bufferHash: createHash('sha256').update(grupo.proveedor + ':' + grupo.filas.length + ':' + hash).digest('hex'),
        usuarioId, catalogo, proveedores, mapeos, secciones,
      })
      if (r.aplicado || r.motivo.includes('ya estaba')) aplicadas++
      else enPrevia++
    }
    return {
      estado: enPrevia && !aplicadas ? 'previa' : 'ok',
      clasificacion: 'planilla',
      destino: `/admin/compras/listas-precios`,
      error: enPrevia ? `${enPrevia} lista(s) quedaron en previa.` : null,
      hash,
      cubiertos,
    }
  }

  if (clas === 'precios') {
    let lista = leerListaBuffer(buf, archivo.nombre, archivo.mime)
    if (!lista && (archivo.mime === 'application/pdf' || /\.pdf$/i.test(archivo.nombre))) {
      const texto = await textoPdf(buf)
      lista = texto ? parsearMayorsur(texto) : null
    }
    if (!lista || !lista.filas.length) {
      return { estado: 'sin_clasificar', clasificacion: 'sin_clasificar', error: 'No encontré precios.', hash }
    }
    const catalogo = await catalogoMatch(adm)
    const secciones = await mapeoSeccionSiExiste(adm)
    const r = await resolverLista(adm, {
      lista, nombreArchivo: archivo.nombre, ruta: archivo.ruta_relativa,
      bufferHash: hash, usuarioId, catalogo, proveedores, mapeos, secciones,
    })
    return {
      estado: r.aplicado || r.motivo.includes('ya estaba') ? 'ok' : 'previa',
      clasificacion: 'precios',
      destino: r.listaId ? `/admin/compras/listas-precios` : null,
      error: r.aplicado ? null : r.motivo,
      matchPct: r.matchPct,
      proveedorId: r.proveedorId,
      listaId: r.listaId,
      anteriorId: r.anteriorId,
      hash,
    }
  }

  if (clas === 'factura') {
    const mime = archivo.mime?.startsWith('image/') || archivo.mime === 'application/pdf'
      ? archivo.mime
      : (/\.pdf$/i.test(archivo.nombre) ? 'application/pdf' : 'image/jpeg')
    const r = await ingerirFactura(adm, { buf, nombre: archivo.nombre, mime, usuarioId, proveedores })
    if ('error' in r && r.error) return { estado: 'error', clasificacion: 'factura', error: r.error, hash }
    const destino = 'extraccionId' in r && r.extraccionId
      ? `/admin/finanzas/documentos/revision/${r.extraccionId}`
      : '/admin/compras/donde-comprar'
    return { estado: 'ok', clasificacion: 'factura', destino, hash }
  }

  if (clas === 'maestro') {
    const r = await estacionarMaestro(adm, { buf, nombre: archivo.nombre, ruta: archivo.ruta_relativa, usuarioId })
    if (!r.ok) return { estado: 'previa', clasificacion: 'maestro', sucursal: r.sucursal, error: r.motivo, hash }
    return {
      estado: 'ok',
      clasificacion: 'maestro',
      sucursal: r.sucursal,
      destino: `/admin/operaciones/sifaco`,
      error: null,
      hash,
    }
  }

  return { estado: 'sin_clasificar', clasificacion: 'sin_clasificar', hash }
}

export async function resumenIngesta(adm: Adm) {
  const { data: conexion } = await adm.from('integraciones_google_drive')
    .select('id, email_cuenta, estado, connected_at, last_sync_at, last_error, listado_completo')
    .order('connected_at', { ascending: false }).limit(1).maybeSingle()
  const { data: carpetas } = conexion
    ? await adm.from('integraciones_google_drive_carpetas').select('id, folder_id, folder_nombre, incluir_subcarpetas').eq('integracion_id', conexion.id).limit(30)
    : { data: [] }
  const estados = ['pendiente', 'procesando', 'ok', 'error', 'sin_clasificar', 'previa'] as const
  const cuentas: Record<string, number> = {}
  for (const e of estados) {
    const { count } = await adm.from('drive_archivos_ingestados').select('id', { count: 'exact', head: true }).eq('estado', e)
    cuentas[e] = count ?? 0
  }
  const total = Object.values(cuentas).reduce((a, b) => a + b, 0)
  const hechos = (cuentas.ok ?? 0) + (cuentas.error ?? 0) + (cuentas.sin_clasificar ?? 0) + (cuentas.previa ?? 0)
  const { data: bandeja } = await adm.from('drive_archivos_ingestados')
    .select('id, file_id, nombre, ruta_relativa, clasificacion, estado, error, web_view_link, match_pct, intentos')
    .in('estado', ['sin_clasificar', 'error', 'previa'])
    .or('destino_ref.is.null,destino_ref.neq.omitido_por_tamano')
    .order('updated_at', { ascending: false }).limit(40)
  // Los que pasan el tope del cron van aparte: reclasificarlos no los destraba
  // (el cron los vuelve a saltear); hay que subirlos a mano.
  const { data: grandes } = await adm.from('drive_archivos_ingestados')
    .select('id, file_id, nombre, ruta_relativa, clasificacion, estado, error, web_view_link, match_pct, intentos, bytes')
    .eq('estado', 'previa').eq('destino_ref', 'omitido_por_tamano')
    .order('updated_at', { ascending: false }).limit(40)
  const { data: pendientes } = await adm.from('drive_archivos_ingestados')
    .select('id, file_id, nombre, ruta_relativa, clasificacion, estado, error, web_view_link, match_pct, intentos')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true }).limit(40)
  return {
    conexion, carpetas: carpetas ?? [], cuentas, total, hechos,
    bandeja: bandeja ?? [], pendientes: pendientes ?? [], grandes: grandes ?? [],
  }
}
