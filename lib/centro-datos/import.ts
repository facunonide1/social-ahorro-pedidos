/**
 * Centro de Datos — núcleo de importación (server, reutilizable por el futuro
 * agente directo SIFACO F20). Separado de la UI/upload. Recibe el admin client.
 *
 * Flujo: mapear (perfil) → analizar (match + semáforo + cambios, NO escribe) →
 * aplicar (snapshot → upsert → import_job → cola sin match).
 *
 * Match SIEMPRE por CODIGO (=sku) primero, luego BARRAS (EAN), luego nombre.
 * Lo que no matchea NO se descarta: va a items_sin_match.
 */
import type {
  Anomalia, CampoSistema, OpcionesPerfil, ResumenImport, TipoPerfilDatos,
} from '@/lib/types/centro-datos'

type Adm = any

export type FilaCruda = Record<string, string>

/** Fila ya mapeada a campos del sistema. */
export type FilaMapeada = {
  fila: number
  sku?: string | null
  codigo_barras?: string | null
  nombre?: string | null
  precio?: number | null
  stock?: number | null
  rubro?: string | null
  laboratorio?: string | null
  droga?: string | null
  estado?: string | null
  cantidad?: number | null
  monto?: number | null
  ventas_mensuales?: Record<string, number>
  nom_promo?: string | null
  def_promo?: string | null
  descuento?: number | null
  precio_oferta?: number | null
  oferta_tipo?: string | null
  oferta_vigencia?: string | null
  cliente_nombre?: string | null
  cliente_doc?: string | null
  cliente_tel?: string | null
  cliente_email?: string | null
  _raw: Record<string, string>
}

export type MatchVia = 'sku' | 'ean' | 'nombre' | null

export function norm(s?: string | null): string {
  return (s ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Convierte "1.234,56" o "1234.56" a número según decimales del perfil. */
export function parseNum(v: string | null | undefined, decimales: ',' | '.' = '.'): number | null {
  if (v == null) return null
  let s = String(v).trim().replace(/[$\s]/g, '')
  if (s === '') return null
  if (decimales === ',') s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Aplica el mapeo de columnas del perfil a las filas crudas. */
export function mapearFilas(
  headers: string[],
  rows: string[][],
  mapeo: Record<string, CampoSistema | string>,
  opciones: OpcionesPerfil,
): FilaMapeada[] {
  const dec = (opciones.decimales ?? '.') as ',' | '.'
  // índice columna → campo
  const idxCampo = new Map<number, CampoSistema>()
  headers.forEach((h, i) => {
    const campo = mapeo[h] ?? mapeo[h.trim()]
    if (campo && campo !== 'ignorar') idxCampo.set(i, campo as CampoSistema)
  })
  return rows.map((r, ri) => {
    const f: FilaMapeada = { fila: ri + 2, _raw: {} }
    const vm: Record<string, number> = {}
    headers.forEach((h, i) => { f._raw[h] = r[i] ?? '' })
    idxCampo.forEach((campo, i) => {
      const val = (r[i] ?? '').trim()
      switch (campo) {
        case 'sku': f.sku = val || null; break
        case 'codigo_barras': f.codigo_barras = val || null; break
        case 'nombre': f.nombre = val || null; break
        case 'rubro': f.rubro = val || null; break
        case 'laboratorio': f.laboratorio = val || null; break
        case 'droga': f.droga = val || null; break
        case 'estado': f.estado = val || null; break
        case 'nom_promo': f.nom_promo = val || null; break
        case 'def_promo': f.def_promo = val || null; break
        case 'oferta_tipo': f.oferta_tipo = val || null; break
        case 'oferta_vigencia': f.oferta_vigencia = val || null; break
        case 'descuento': f.descuento = parseNum(val, dec); break
        case 'precio_oferta': f.precio_oferta = parseNum(val, dec); break
        case 'cliente_nombre': f.cliente_nombre = val || null; break
        case 'cliente_doc': f.cliente_doc = val || null; break
        case 'cliente_tel': f.cliente_tel = val || null; break
        case 'cliente_email': f.cliente_email = val || null; break
        case 'precio': f.precio = parseNum(val, dec); break
        case 'stock': f.stock = parseNum(val, dec); break
        case 'cantidad': f.cantidad = parseNum(val, dec); break
        case 'monto': f.monto = parseNum(val, dec); break
        case 'venta_mes': vm.mes_act = parseNum(val, dec) ?? 0; break
        case 'ant_1': case 'ant_2': case 'ant_3':
        case 'ant_4': case 'ant_5': case 'ant_6':
          vm[campo] = parseNum(val, dec) ?? 0; break
      }
    })
    if (Object.keys(vm).length) f.ventas_mensuales = vm
    return f
  }).filter((f) => f.sku || f.codigo_barras || f.nombre || f.cliente_nombre)
}

// ===== Matcher =====
export type Catalogo = { id: string; sku: string | null; codigo_barras: string | null; nombre: string; precio_sugerido: number | null }
export type Matcher = {
  porSku: Map<string, Catalogo>; porEan: Map<string, Catalogo>; porNombre: Map<string, Catalogo>
}

export async function buildMatcher(adm: Adm): Promise<{ matcher: Matcher; catalogo: Catalogo[] }> {
  const { data } = await adm
    .from('productos_catalogo')
    .select('id, sku, codigo_barras, nombre, precio_sugerido')
    .eq('activo', true).limit(50000)
  const catalogo = (data ?? []) as Catalogo[]
  const porSku = new Map<string, Catalogo>()
  const porEan = new Map<string, Catalogo>()
  const porNombre = new Map<string, Catalogo>()
  for (const c of catalogo) {
    if (c.sku) porSku.set(c.sku.trim().toLowerCase(), c)
    if (c.codigo_barras) porEan.set(String(c.codigo_barras).trim(), c)
    porNombre.set(norm(c.nombre), c)
  }
  return { matcher: { porSku, porEan, porNombre }, catalogo }
}

export function matchFila(f: FilaMapeada, m: Matcher): { producto: Catalogo | null; via: MatchVia } {
  const sku = f.sku ? f.sku.trim().toLowerCase() : ''
  const ean = f.codigo_barras ? String(f.codigo_barras).trim() : ''
  const nom = f.nombre ? norm(f.nombre) : ''
  if (sku && m.porSku.has(sku)) return { producto: m.porSku.get(sku)!, via: 'sku' }
  if (ean && m.porEan.has(ean)) return { producto: m.porEan.get(ean)!, via: 'ean' }
  if (nom && m.porNombre.has(nom)) return { producto: m.porNombre.get(nom)!, via: 'nombre' }
  return { producto: null, via: null }
}

// ===== Oferta dentro del archivo de productos =====
export type OfertaConstruida = {
  tipo: string          // enum oferta_tipo
  valor: number | null
  nombre: string
  fecha_fin: string | null
  label: string         // texto humano para el preview
}

const TIPOS_OFERTA = ['porcentaje_descuento', 'precio_fijo', '2x1', 'nxm', 'combo', 'segunda_unidad_pct', 'descuento_por_cantidad', 'combo_dinamico', 'oferta_cruzada']

function mapTipoOferta(txt?: string | null): string | null {
  if (!txt) return null
  const t = norm(txt)
  if (TIPOS_OFERTA.includes(txt.trim())) return txt.trim()
  if (/2.?x.?1/.test(t)) return '2x1'
  if (t.includes('fijo')) return 'precio_fijo'
  if (t.includes('segunda') || t.includes('2da')) return 'segunda_unidad_pct'
  if (t.includes('combo')) return 'combo'
  if (t.includes('porc') || t.includes('desc') || txt.includes('%')) return 'porcentaje_descuento'
  return null
}

/** Parsea una vigencia (dd/mm/aaaa o aaaa-mm-dd) a fecha ISO YYYY-MM-DD. */
export function parseFechaVig(v?: string | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/**
 * Si la fila trae datos de oferta (precio con descuento, % o nombre de promo),
 * construye la oferta a crear. precioRef = precio normal del producto.
 */
export function construirOferta(f: FilaMapeada, precioRef: number | null): OfertaConstruida | null {
  const tieneOferta = (f.precio_oferta != null && f.precio_oferta > 0) || (f.descuento != null && f.descuento > 0) || !!f.nom_promo
  if (!tieneOferta) return null
  let tipo = mapTipoOferta(f.oferta_tipo)
  let valor: number | null = null
  if (!tipo) {
    if (f.descuento != null && f.descuento > 0) { tipo = 'porcentaje_descuento'; valor = f.descuento }
    else if (f.precio_oferta != null) { tipo = 'precio_fijo'; valor = f.precio_oferta }
    else tipo = 'porcentaje_descuento'
  }
  if (valor == null) {
    if (tipo === 'precio_fijo') valor = f.precio_oferta ?? null
    else if (tipo === 'porcentaje_descuento') {
      valor = f.descuento ?? (precioRef && f.precio_oferta != null && precioRef > 0
        ? Math.round(((precioRef - f.precio_oferta) / precioRef) * 100) : null)
    }
  }
  const nombre = (f.nom_promo || f.def_promo || `Oferta ${f.nombre ?? f.sku ?? ''}`).toString().slice(0, 120).trim()
  const fechaFin = parseFechaVig(f.oferta_vigencia)
  const label = tipo === 'precio_fijo' ? (valor != null ? `Precio fijo $${valor.toLocaleString('es-AR')}` : 'Precio fijo')
    : tipo === '2x1' ? '2x1'
    : tipo === 'porcentaje_descuento' ? (valor != null ? `${valor}% off` : 'Descuento')
    : (f.nom_promo ?? tipo)
  return { tipo, valor, nombre, fecha_fin: fechaFin, label }
}

// ===== Análisis (preview) =====
export type ItemAnalizado = {
  fila: number
  sku: string | null
  codigo_barras: string | null
  nombre: string | null
  producto_id: string | null
  nombre_match: string | null
  via: MatchVia
  precio_nuevo: number | null
  precio_anterior: number | null
  delta_precio_pct: number | null
  stock_nuevo: number | null
  cantidad: number | null
  monto: number | null
  es_nuevo: boolean
  tiene_oferta: boolean
  precio_oferta: number | null
  oferta_label: string | null
}

export type CambioPrecio = { producto_id: string; sku: string | null; nombre: string; precio_anterior: number; precio_nuevo: number }

export type Analisis = {
  total: number
  matcheados: number
  sin_match: number
  anomalias: Anomalia[]
  resumen: ResumenImport
  preview: ItemAnalizado[]   // recortado para UI
  filas: FilaMapeada[]       // todas, para confirmar
  cambios_precio: CambioPrecio[] // OS-3 · D: para la lista de recartelado (todos, no solo el preview)
}

/** Umbral de variación de precio para marcar anomalía. */
const UMBRAL_PRECIO_PCT = 30

export async function analizar(
  adm: Adm,
  tipo: TipoPerfilDatos,
  filas: FilaMapeada[],
  ctx: { sucursalId?: string | null; perfilId?: string | null; fecha?: string | null } = {},
): Promise<Analisis> {
  const { matcher, catalogo } = await buildMatcher(adm)
  let matcheados = 0
  const items: ItemAnalizado[] = filas.map((f) => {
    const { producto, via } = matchFila(f, matcher)
    if (producto) matcheados++
    const precioAnt = producto?.precio_sugerido ?? null
    const precioNue = f.precio ?? null
    let delta: number | null = null
    if (precioAnt != null && precioNue != null && precioAnt > 0) {
      delta = ((precioNue - precioAnt) / precioAnt) * 100
    }
    const of = construirOferta(f, precioAnt ?? precioNue)
    return {
      fila: f.fila, sku: f.sku ?? null, codigo_barras: f.codigo_barras ?? null,
      nombre: f.nombre ?? null, producto_id: producto?.id ?? null,
      nombre_match: producto?.nombre ?? null, via,
      precio_nuevo: precioNue, precio_anterior: precioAnt,
      delta_precio_pct: delta != null ? Math.round(delta * 10) / 10 : null,
      stock_nuevo: f.stock ?? null, cantidad: f.cantidad ?? null, monto: f.monto ?? null,
      es_nuevo: !producto,
      tiene_oferta: !!of, precio_oferta: f.precio_oferta ?? null, oferta_label: of?.label ?? null,
    }
  })

  const sinMatch = filas.length - matcheados
  const anomalias: Anomalia[] = []

  // mejora 2: semáforo
  if (sinMatch > 0) {
    anomalias.push({
      tipo: 'sin_match', severidad: sinMatch > filas.length * 0.2 ? 'critica' : 'warning',
      mensaje: `${sinMatch} fila${sinMatch === 1 ? '' : 's'} sin match con el catálogo`,
      detalle: 'Van a la cola "Sin matchear" para crear o vincular.', cantidad: sinMatch,
    })
  }
  // caída brusca de cantidad de productos (productos/stock)
  if ((tipo === 'productos' || tipo === 'stock') && catalogo.length > 50) {
    const ratio = filas.length / catalogo.length
    if (ratio < 0.6) {
      anomalias.push({
        tipo: 'caida_productos', severidad: 'critica',
        mensaje: `El archivo trae ${filas.length} productos vs ${catalogo.length} en el catálogo (${Math.round(ratio * 100)}%)`,
        detalle: '¿Archivo incompleto? Revisá antes de aplicar.',
      })
    }
  }
  // variaciones de precio fuertes
  const subiB = items.filter((i) => i.delta_precio_pct != null && i.delta_precio_pct > UMBRAL_PRECIO_PCT)
  const bajaB = items.filter((i) => i.delta_precio_pct != null && i.delta_precio_pct < -UMBRAL_PRECIO_PCT)
  if (subiB.length) anomalias.push({ tipo: 'precio_sube', severidad: 'warning', mensaje: `${subiB.length} producto(s) suben de precio más de ${UMBRAL_PRECIO_PCT}%`, cantidad: subiB.length })
  if (bajaB.length) anomalias.push({ tipo: 'precio_baja', severidad: 'warning', mensaje: `${bajaB.length} producto(s) bajan de precio más de ${UMBRAL_PRECIO_PCT}%`, cantidad: bajaB.length })
  // stock negativo
  const neg = items.filter((i) => i.stock_nuevo != null && i.stock_nuevo < 0)
  if (neg.length) anomalias.push({ tipo: 'stock_negativo', severidad: 'warning', mensaje: `${neg.length} fila(s) con stock negativo`, cantidad: neg.length })

  if (!anomalias.length) anomalias.push({ tipo: 'ok', severidad: 'info', mensaje: 'Sin anomalías detectadas. Listo para importar.' })

  // mejora 3: detección de cambios
  const nuevos = items.filter((i) => i.es_nuevo).length
  const subieron = items.filter((i) => i.delta_precio_pct != null && i.delta_precio_pct > 0).length
  const bajaron = items.filter((i) => i.delta_precio_pct != null && i.delta_precio_pct < 0).length
  const conStock = filas.filter((f) => (f.stock ?? 0) > 0).length
  const conPrecio = filas.filter((f) => (f.precio ?? 0) > 0).length
  const conOferta = items.filter((i) => i.tiene_oferta).length
  const rubros = Array.from(new Set(filas.map((f) => f.rubro).filter(Boolean))).slice(0, 8) as string[]

  const resumen: ResumenImport = {
    total: filas.length, con_stock: conStock, con_precio: conPrecio,
    rubros, nuevos, subieron_precio: subieron, bajaron_precio: bajaron,
    cambio_stock: tipo === 'stock' || tipo === 'productos' ? filas.length : 0,
    con_oferta: conOferta,
    texto: explicar(tipo, filas, { conStock, nuevos, rubros }),
  }

  const cambios_precio: CambioPrecio[] = items
    .filter((i) => i.producto_id && i.precio_anterior != null && i.precio_nuevo != null && Number(i.precio_anterior) !== Number(i.precio_nuevo))
    .map((i) => ({ producto_id: i.producto_id as string, sku: i.sku, nombre: i.nombre_match ?? i.nombre ?? (i.sku ?? ''), precio_anterior: Number(i.precio_anterior), precio_nuevo: Number(i.precio_nuevo) }))

  return {
    total: filas.length, matcheados, sin_match: sinMatch,
    anomalias, resumen, preview: items.slice(0, 300), filas, cambios_precio,
  }
}

/** mejora 8: NORA explica el archivo en lenguaje natural. */
function explicar(tipo: TipoPerfilDatos, filas: FilaMapeada[], x: { conStock: number; nuevos: number; rubros: string[] }): string {
  const n = filas.length
  if (tipo === 'ventas') {
    const unidades = filas.reduce((a, f) => a + (f.cantidad ?? 0), 0)
    const monto = filas.reduce((a, f) => a + (f.monto ?? 0), 0)
    return `${n.toLocaleString('es-AR')} líneas de venta, ${unidades.toLocaleString('es-AR')} unidades vendidas${monto ? `, $${Math.round(monto).toLocaleString('es-AR')} facturado` : ''}. ${x.nuevos} producto(s) que no están en el catálogo.`
  }
  if (tipo === 'clientes') {
    return `${n.toLocaleString('es-AR')} clientes en el archivo.`
  }
  const rubroTxt = x.rubros.length ? `, rubro ${x.rubros.slice(0, 3).join('/')}` : ''
  return `${n.toLocaleString('es-AR')} productos, ${x.conStock.toLocaleString('es-AR')} con stock${rubroTxt}. ${x.nuevos} nuevo(s) vs el catálogo actual.`
}

// ===== Aplicar (con snapshot para rollback) =====
export type SnapRow = { tabla: string; pk: Record<string, unknown>; datos_previos: Record<string, unknown> | null }

export type ResultadoAplicar = {
  import_job_id: string
  filas_ok: number
  filas_sin_match: number
  snapshot_id: string | null
  creados: number
  ofertas_creadas: number
}

/**
 * Aplica un import. Crea el import_job (preview→aplicado), arma el snapshot de
 * las filas afectadas, escribe los cambios y manda los no-matcheados a la cola.
 */
export async function aplicar(
  adm: Adm,
  opts: {
    tipo: TipoPerfilDatos
    perfilId: string | null
    sucursalId: string | null
    fecha?: string | null
    archivoNombre: string | null
    archivoHash: string | null
    filas: FilaMapeada[]
    analisis: Analisis
    usuarioId: string | null
    usuarioNombre: string | null
    esDemo?: boolean
    /** SKUs nuevos que el usuario CONFIRMÓ crear (los demás no-match van a la cola). */
    crearSkus?: string[]
  },
): Promise<ResultadoAplicar> {
  const { tipo, filas } = opts
  const { matcher } = await buildMatcher(adm)
  const stats = { creados: 0, ofertas: 0 }

  // 1) import_job en preview
  const { data: job, error: eJob } = await adm.from('import_jobs').insert({
    perfil_id: opts.perfilId, sucursal_id: opts.sucursalId,
    archivo_nombre: opts.archivoNombre, archivo_hash: opts.archivoHash,
    filas_total: opts.analisis.total, filas_ok: 0,
    filas_fallidas: 0, filas_sin_match: opts.analisis.sin_match,
    anomalias: opts.analisis.anomalias, resumen: opts.analisis.resumen,
    estado: 'preview', es_demo: !!opts.esDemo,
    por_usuario: opts.usuarioId, por_usuario_nombre: opts.usuarioNombre,
  }).select('id').single()
  if (eJob) throw new Error(eJob.message)
  const jobId = job.id as string

  const snapshot: SnapRow[] = []
  const sinMatch: any[] = []
  let ok = 0

  if (tipo === 'productos' || tipo === 'stock') {
    ok = await aplicarProductos(adm, { ...opts, jobId, matcher, snapshot, sinMatch, stats })
  } else if (tipo === 'ventas') {
    ok = await aplicarVentas(adm, { ...opts, jobId, matcher, snapshot, sinMatch })
  } else if (tipo === 'clientes') {
    ok = await aplicarClientes(adm, { ...opts, jobId, snapshot, sinMatch })
  } else {
    // custom u otros: solo registra (no aplica cambios destructivos)
    ok = filas.length
  }

  // 2) snapshot
  let snapshotId: string | null = null
  if (snapshot.length) {
    const porTabla = new Map<string, SnapRow[]>()
    for (const s of snapshot) {
      if (!porTabla.has(s.tabla)) porTabla.set(s.tabla, [])
      porTabla.get(s.tabla)!.push(s)
    }
    for (const [tabla, rows] of Array.from(porTabla.entries())) {
      const { data: snap } = await adm.from('snapshots_import').insert({
        import_job_id: jobId, tabla, datos: rows, filas: rows.length,
      }).select('id').single()
      if (!snapshotId && snap) snapshotId = snap.id
    }
  }

  // 3) cola sin match
  if (sinMatch.length) {
    await adm.from('items_sin_match').insert(sinMatch.map((s) => ({ ...s, import_job_id: jobId, es_demo: !!opts.esDemo })))
  }

  // 4) cerrar job
  await adm.from('import_jobs').update({
    estado: 'aplicado', filas_ok: ok, filas_sin_match: sinMatch.length,
    snapshot_id: snapshotId, aplicado_at: new Date().toISOString(),
  }).eq('id', jobId)

  // 5) marcar perfil cargado
  if (opts.perfilId) {
    await adm.from('perfiles_datos').update({ ultima_carga: new Date().toISOString() }).eq('id', opts.perfilId)
  }

  return { import_job_id: jobId, filas_ok: ok, filas_sin_match: sinMatch.length, snapshot_id: snapshotId, creados: stats.creados, ofertas_creadas: stats.ofertas }
}

/**
 * Crea una oferta (borrador) a partir de una fila de producto que trae datos de
 * oferta, enlazada al producto por su id. Dedup: si ya existe una oferta con el
 * mismo nombre y producto en borrador/activa, no la duplica. Snapshot para revert.
 */
async function crearOfertaDesdeProducto(
  adm: Adm, productoId: string, of: OfertaConstruida,
  ctx: { rubro?: string | null; usuarioId: string | null; esDemo?: boolean }, snapshot: SnapRow[],
): Promise<boolean> {
  const { data: dup } = await adm.from('ofertas')
    .select('id').contains('productos_ids', [productoId]).eq('nombre', of.nombre)
    .in('estado', ['borrador', 'activa', 'aprobada', 'pendiente_aprobacion']).limit(1).maybeSingle()
  if (dup) return false
  const { data: nueva, error } = await adm.from('ofertas').insert({
    nombre: of.nombre, tipo: of.tipo, valor: of.valor,
    productos_ids: [productoId], rubro: ctx.rubro ?? null,
    canales: ['cartel', 'cuponera'],
    vigencia_tipo: of.fecha_fin ? 'con_fecha' : 'permanente',
    fecha_inicio: of.fecha_fin ? new Date().toISOString().slice(0, 10) : null,
    fecha_fin: of.fecha_fin,
    estado: 'borrador', es_demo: !!ctx.esDemo, created_by: ctx.usuarioId,
  }).select('id').single()
  if (error || !nueva) return false
  snapshot.push({ tabla: 'ofertas', pk: { id: nueva.id }, datos_previos: null })
  return true
}

async function aplicarProductos(adm: Adm, a: any): Promise<number> {
  const { tipo, filas, sucursalId, snapshot, sinMatch, matcher, stats, usuarioId, esDemo } = a
  // SKUs nuevos confirmados por el usuario (normalizados).
  const crearSet = new Set<string>(((a.crearSkus ?? []) as string[]).map((s) => String(s).trim().toLowerCase()))
  let ok = 0
  for (const f of filas as FilaMapeada[]) {
    let { producto } = matchFila(f, matcher)
    // ---- producto NUEVO confirmado: crearlo ----
    if (!producto) {
      const skuKey = f.sku ? f.sku.trim().toLowerCase() : ''
      const confirmado = skuKey && crearSet.has(skuKey)
      if (!confirmado || (!f.sku && !f.codigo_barras)) {
        sinMatch.push({
          sku: f.sku ?? null, codigo: f.sku ?? null, barras: f.codigo_barras ?? null,
          descripcion_origen: f.nombre ?? null, datos: f._raw,
        })
        continue
      }
      const { data: nuevo, error: eIns } = await adm.from('productos_catalogo').insert({
        sku: f.sku ?? null, codigo_barras: f.codigo_barras ?? null,
        nombre: f.nombre ?? f.sku ?? 'Sin nombre',
        precio_sugerido: f.precio ?? null, rubro: f.rubro ?? null,
        laboratorio: f.laboratorio ?? null, droga_principal: f.droga ?? null,
        ventas_mensuales: f.ventas_mensuales ? { ...f.ventas_mensuales, actualizado: new Date().toISOString().slice(0, 10) } : null,
        activo: true,
      }).select('id, sku, codigo_barras, nombre, precio_sugerido').single()
      if (eIns || !nuevo) {
        sinMatch.push({ sku: f.sku ?? null, codigo: f.sku ?? null, barras: f.codigo_barras ?? null, descripcion_origen: f.nombre ?? null, datos: f._raw })
        continue
      }
      snapshot.push({ tabla: 'productos_catalogo', pk: { id: nuevo.id }, datos_previos: null })
      // registrar en el matcher para evitar duplicados si el archivo repite el SKU
      const cat: Catalogo = { id: nuevo.id, sku: nuevo.sku, codigo_barras: nuevo.codigo_barras, nombre: nuevo.nombre, precio_sugerido: nuevo.precio_sugerido }
      if (cat.sku) matcher.porSku.set(cat.sku.trim().toLowerCase(), cat)
      if (cat.codigo_barras) matcher.porEan.set(String(cat.codigo_barras).trim(), cat)
      matcher.porNombre.set(norm(cat.nombre), cat)
      producto = cat
      stats.creados++
      // oferta del archivo para el producto recién creado
      const of = construirOferta(f, f.precio ?? null)
      if (of && await crearOfertaDesdeProducto(adm, producto.id, of, { rubro: f.rubro, usuarioId, esDemo }, snapshot)) stats.ofertas++
      // stock en la sucursal elegida
      if (f.stock != null && sucursalId) {
        await adm.from('stock_items').upsert({ producto_id: producto.id, sucursal_id: sucursalId, cantidad_gondola: f.stock, updated_at: new Date().toISOString() }, { onConflict: 'producto_id,sucursal_id' })
        snapshot.push({ tabla: 'stock_items', pk: { producto_id: producto.id, sucursal_id: sucursalId }, datos_previos: null })
      }
      ok++
      continue
    }
    // ---- producto EXISTENTE: oferta del archivo (dedup) ----
    {
      const of = construirOferta(f, producto.precio_sugerido ?? f.precio ?? null)
      if (of && await crearOfertaDesdeProducto(adm, producto.id, of, { rubro: f.rubro, usuarioId, esDemo }, snapshot)) stats.ofertas++
    }
    // ---- catálogo (productos: precio/rubro/lab/droga/ventas_mensuales) ----
    if (tipo === 'productos') {
      const upd: Record<string, unknown> = {}
      const prev: Record<string, unknown> = {}
      const setIf = (col: string, val: unknown, prevVal: unknown) => {
        if (val != null && val !== '') { upd[col] = val; prev[col] = prevVal }
      }
      // leemos el estado previo de las columnas que tocamos
      const { data: pc } = await adm.from('productos_catalogo')
        .select('precio_sugerido, rubro, laboratorio, droga_principal, ventas_mensuales')
        .eq('id', producto.id).single()
      setIf('precio_sugerido', f.precio, pc?.precio_sugerido ?? null)
      setIf('rubro', f.rubro, pc?.rubro ?? null)
      setIf('laboratorio', f.laboratorio, pc?.laboratorio ?? null)
      setIf('droga_principal', f.droga, pc?.droga_principal ?? null)
      if (f.ventas_mensuales) {
        upd.ventas_mensuales = { ...f.ventas_mensuales, actualizado: new Date().toISOString().slice(0, 10) }
        prev.ventas_mensuales = pc?.ventas_mensuales ?? null
      }
      if (Object.keys(upd).length) {
        snapshot.push({ tabla: 'productos_catalogo', pk: { id: producto.id }, datos_previos: prev })
        await adm.from('productos_catalogo').update(upd).eq('id', producto.id)
      }
    }
    // ---- stock (góndola) en la sucursal elegida ----
    if (f.stock != null && sucursalId) {
      const { data: si } = await adm.from('stock_items')
        .select('id, cantidad_gondola, cantidad_deposito')
        .eq('producto_id', producto.id).eq('sucursal_id', sucursalId).maybeSingle()
      snapshot.push({
        tabla: 'stock_items',
        pk: { producto_id: producto.id, sucursal_id: sucursalId },
        datos_previos: si ? { cantidad_gondola: si.cantidad_gondola, cantidad_deposito: si.cantidad_deposito } : null,
      })
      await adm.from('stock_items').upsert({
        producto_id: producto.id, sucursal_id: sucursalId,
        cantidad_gondola: f.stock, updated_at: new Date().toISOString(),
      }, { onConflict: 'producto_id,sucursal_id' })
    }
    ok++
  }
  return ok
}

async function aplicarVentas(adm: Adm, a: any): Promise<number> {
  const { filas, sucursalId, fecha, jobId, snapshot, sinMatch, matcher, esDemo } = a
  if (!sucursalId || !fecha) throw new Error('ventas: sucursal y fecha requeridas')
  // snapshot de las ventas previas de ese día+sucursal (para rollback)
  const { data: prev } = await adm.from('ventas_diarias')
    .select('id, sku, cantidad, monto, producto_id, descripcion')
    .eq('sucursal_id', sucursalId).eq('fecha', fecha)
  for (const p of (prev ?? []) as any[]) {
    snapshot.push({ tabla: 'ventas_diarias', pk: { fecha, sucursal_id: sucursalId, sku: p.sku }, datos_previos: p })
  }
  let ok = 0
  const rows: any[] = []
  for (const f of filas as FilaMapeada[]) {
    if (!f.sku) {
      sinMatch.push({ sku: null, codigo: null, barras: f.codigo_barras ?? null, descripcion_origen: f.nombre ?? null, datos: f._raw })
      continue
    }
    const { producto } = matchFila(f, matcher)
    if (!producto) {
      sinMatch.push({ sku: f.sku, codigo: f.sku, barras: f.codigo_barras ?? null, descripcion_origen: f.nombre ?? null, datos: f._raw })
    }
    rows.push({
      fecha, sucursal_id: sucursalId, producto_id: producto?.id ?? null,
      sku: f.sku, descripcion: f.nombre ?? null,
      cantidad: f.cantidad ?? 0, monto: f.monto ?? 0,
      importado_de: jobId, es_demo: !!esDemo,
    })
    ok++
  }
  if (rows.length) {
    await adm.from('ventas_diarias').upsert(rows, { onConflict: 'fecha,sucursal_id,sku' })
  }
  return ok
}

async function aplicarClientes(adm: Adm, a: any): Promise<number> {
  const { filas, snapshot, sinMatch } = a
  let ok = 0
  for (const f of filas as FilaMapeada[]) {
    if (!f.cliente_nombre) { sinMatch.push({ sku: null, descripcion_origen: null, datos: f._raw }); continue }
    // best-effort: alta de cliente CRM (no pisa existentes por doc)
    const doc = f.cliente_doc ?? null
    let existe: any = null
    if (doc) {
      const { data } = await adm.from('clientes_crm').select('id').or(`cuit.eq.${doc},dni.eq.${doc}`).maybeSingle()
      existe = data
    }
    if (existe) { ok++; continue }
    const { data: nuevo } = await adm.from('clientes_crm').insert({
      razon_social: f.cliente_nombre, cuit: doc, telefono: f.cliente_tel ?? null, email: f.cliente_email ?? null,
    }).select('id').single()
    if (nuevo) snapshot.push({ tabla: 'clientes_crm', pk: { id: nuevo.id }, datos_previos: null })
    ok++
  }
  return ok
}

/** Rollback (T5): revierte un import aplicado restaurando el snapshot. */
export async function revertir(adm: Adm, jobId: string): Promise<void> {
  const { data: job } = await adm.from('import_jobs').select('id, estado').eq('id', jobId).single()
  if (!job || job.estado !== 'aplicado') throw new Error('El import no está aplicado o no existe')
  const { data: snaps } = await adm.from('snapshots_import').select('tabla, datos').eq('import_job_id', jobId)
  for (const s of (snaps ?? []) as any[]) {
    const rows = (s.datos ?? []) as SnapRow[]
    for (const r of rows) {
      if (r.datos_previos === null) {
        // no existía → borrar lo creado
        await deletePk(adm, s.tabla, r.pk)
      } else {
        await adm.from(s.tabla).update(r.datos_previos).match(r.pk)
      }
    }
  }
  // ventas: borrar las filas que creó este job y que no estaban en el snapshot
  await adm.from('ventas_diarias').delete().eq('importado_de', jobId)
  // re-aplicar snapshots de ventas (las que existían antes)
  const ventasSnap = (snaps ?? []).find((s: any) => s.tabla === 'ventas_diarias')
  if (ventasSnap) {
    const rows = (ventasSnap.datos ?? []) as SnapRow[]
    const toRestore = rows.filter((r) => r.datos_previos).map((r) => ({ ...(r.datos_previos as any) }))
    if (toRestore.length) await adm.from('ventas_diarias').upsert(toRestore, { onConflict: 'fecha,sucursal_id,sku' })
  }
  // cola sin match de este job → borrar
  await adm.from('items_sin_match').delete().eq('import_job_id', jobId)
  await adm.from('import_jobs').update({ estado: 'revertido', revertido_at: new Date().toISOString() }).eq('id', jobId)
}

async function deletePk(adm: Adm, tabla: string, pk: Record<string, unknown>) {
  let q = adm.from(tabla).delete()
  for (const [k, v] of Object.entries(pk)) q = q.eq(k, v)
  await q
}
