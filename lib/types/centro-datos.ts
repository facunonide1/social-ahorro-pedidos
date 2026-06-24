/**
 * Centro de Datos — puente bidireccional con SIFACO (tipos compartidos).
 * Match maestro en todo el sistema: CODIGO (= SKU interno).
 */

export type DireccionDatos = 'import' | 'export'
export type TipoPerfilDatos =
  | 'productos' | 'stock' | 'ventas' | 'clientes' | 'ofertas' | 'dif_stock' | 'custom'
export type FormatoDatos = 'xls' | 'xlsx' | 'csv' | 'txt'
export type FrecuenciaDatos = 'manual' | 'cada_2hs' | 'diaria' | 'semanal'
export type EstadoImportJob = 'preview' | 'aplicado' | 'revertido' | 'error'
export type EstadoSinMatch = 'pendiente' | 'creado' | 'vinculado' | 'ignorado'

/** Campos del sistema a los que puede mapear una columna del archivo (import). */
export type CampoSistema =
  | 'sku' | 'codigo_barras' | 'nombre' | 'precio' | 'stock' | 'rubro'
  | 'laboratorio' | 'droga' | 'estado' | 'tipo'
  | 'venta_mes' | 'ant_1' | 'ant_2' | 'ant_3' | 'ant_4' | 'ant_5' | 'ant_6'
  | 'nom_promo' | 'def_promo' | 'descuento' | 'recargo'
  // oferta dentro del archivo de productos (opcionales)
  | 'precio_oferta' | 'oferta_tipo' | 'oferta_vigencia'
  // ventas diarias
  | 'cantidad' | 'monto'
  // clientes
  | 'cliente_nombre' | 'cliente_doc' | 'cliente_tel' | 'cliente_email'
  | 'ignorar'

export const CAMPOS_SISTEMA: { value: CampoSistema; label: string; tipos: TipoPerfilDatos[] }[] = [
  { value: 'sku', label: 'CODIGO → SKU (llave)', tipos: ['productos', 'stock', 'ventas', 'dif_stock', 'ofertas'] },
  { value: 'codigo_barras', label: 'BARRAS / EAN', tipos: ['productos', 'stock', 'ventas'] },
  { value: 'nombre', label: 'Descripción / Nombre', tipos: ['productos', 'stock', 'ventas', 'clientes'] },
  { value: 'precio', label: 'Precio normal / lista', tipos: ['productos', 'ofertas'] },
  { value: 'stock', label: 'Stock', tipos: ['productos', 'stock', 'dif_stock'] },
  { value: 'rubro', label: 'Rubro', tipos: ['productos'] },
  { value: 'laboratorio', label: 'Laboratorio', tipos: ['productos'] },
  { value: 'droga', label: 'Droga / Principio activo', tipos: ['productos'] },
  { value: 'estado', label: 'Estado', tipos: ['productos'] },
  { value: 'tipo', label: 'Tipo', tipos: ['productos'] },
  { value: 'venta_mes', label: 'MES_ACT (venta mes actual)', tipos: ['productos'] },
  { value: 'ant_1', label: 'ANT_1 (mes -1)', tipos: ['productos'] },
  { value: 'ant_2', label: 'ANT_2 (mes -2)', tipos: ['productos'] },
  { value: 'ant_3', label: 'ANT_3 (mes -3)', tipos: ['productos'] },
  { value: 'ant_4', label: 'ANT_4 (mes -4)', tipos: ['productos'] },
  { value: 'ant_5', label: 'ANT_5 (mes -5)', tipos: ['productos'] },
  { value: 'ant_6', label: 'ANT_6 (mes -6)', tipos: ['productos'] },
  { value: 'nom_promo', label: 'Oferta: nombre (NOM_PROMO)', tipos: ['productos', 'ofertas'] },
  { value: 'def_promo', label: 'Oferta: descripción (DEF_PROMO)', tipos: ['productos', 'ofertas'] },
  { value: 'descuento', label: 'Oferta: % descuento (DESCU)', tipos: ['productos', 'ofertas'] },
  { value: 'precio_oferta', label: 'Oferta: precio con descuento', tipos: ['productos', 'ofertas'] },
  { value: 'oferta_tipo', label: 'Oferta: tipo (2x1, %, precio fijo…)', tipos: ['productos', 'ofertas'] },
  { value: 'oferta_vigencia', label: 'Oferta: vigencia / fecha fin', tipos: ['productos', 'ofertas'] },
  { value: 'recargo', label: 'RECAR (recargo)', tipos: ['productos'] },
  { value: 'cantidad', label: 'Cantidad vendida', tipos: ['ventas'] },
  { value: 'monto', label: 'Monto vendido', tipos: ['ventas'] },
  { value: 'cliente_nombre', label: 'Nombre cliente', tipos: ['clientes'] },
  { value: 'cliente_doc', label: 'Documento / CUIT', tipos: ['clientes'] },
  { value: 'cliente_tel', label: 'Teléfono', tipos: ['clientes'] },
  { value: 'cliente_email', label: 'Email', tipos: ['clientes'] },
  { value: 'ignorar', label: '— ignorar columna —', tipos: ['productos', 'stock', 'ventas', 'clientes', 'ofertas', 'dif_stock', 'custom'] },
]

/** Opciones de parseo/formato (perfil). */
export type OpcionesPerfil = {
  separador?: ',' | ';' | '\t' | '|'
  decimales?: ',' | '.'
  formato_fecha?: string
  con_encabezado?: boolean
  encoding?: string
  hoja?: string | number
}

export type PerfilDatos = {
  id: string
  nombre: string
  descripcion: string | null
  direccion: DireccionDatos
  tipo: TipoPerfilDatos
  formato: FormatoDatos
  mapeo_columnas: Record<string, CampoSistema | string>
  opciones: OpcionesPerfil
  frecuencia: FrecuenciaDatos
  es_sistema: boolean
  es_demo: boolean
  activo: boolean
  ultima_carga: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Anomalía detectada en el preview (semáforo, mejora 2). */
export type Anomalia = {
  tipo:
    | 'caida_productos' | 'precio_sube' | 'precio_baja' | 'sin_match'
    | 'stock_negativo' | 'duplicado' | 'archivo_viejo' | 'ok'
  severidad: 'info' | 'warning' | 'critica'
  mensaje: string
  detalle?: string
  cantidad?: number
}

/** Detección de cambios vs última carga (mejora 3). */
export type ResumenImport = {
  // explicación NORA (mejora 8)
  total?: number
  con_stock?: number
  con_precio?: number
  rubros?: string[]
  actualizado?: string
  texto?: string
  // cambios
  nuevos?: number
  subieron_precio?: number
  bajaron_precio?: number
  cambio_stock?: number
  con_oferta?: number
}

export type ImportJob = {
  id: string
  perfil_id: string | null
  sucursal_id: string | null
  archivo_nombre: string | null
  archivo_hash: string | null
  filas_total: number
  filas_ok: number
  filas_fallidas: number
  filas_sin_match: number
  anomalias: Anomalia[]
  resumen: ResumenImport
  snapshot_id: string | null
  estado: EstadoImportJob
  es_demo: boolean
  por_usuario: string | null
  por_usuario_nombre: string | null
  created_at: string
  aplicado_at: string | null
  revertido_at: string | null
}

export type ExportJob = {
  id: string
  perfil_id: string | null
  accion_id: string | null
  nombre: string | null
  filas: number
  archivo_generado: string | null
  formato: FormatoDatos | null
  es_demo: boolean
  por_usuario: string | null
  por_usuario_nombre: string | null
  created_at: string
}

/** Definición de una acción de export configurable (constructor). */
export type EntidadExport = 'productos' | 'ofertas' | 'stock' | 'dif_stock' | 'ventas'

export type ColumnaExport = { campo: string; header: string; orden: number }

export type QueryDefinicion = {
  entidad: EntidadExport
  filtros?: {
    rubro?: string
    sucursal_id?: string
    estado?: string
    sin_venta_dias?: number
    solo_activos?: boolean
    [k: string]: unknown
  }
  columnas: ColumnaExport[]
}

export type AccionExport = {
  id: string
  nombre: string
  descripcion: string | null
  query_definicion: QueryDefinicion
  perfil_formato_id: string | null
  icono: string | null
  es_sistema: boolean
  es_demo: boolean
  activa: boolean
  frecuencia: FrecuenciaDatos
  ultima_ejecucion: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type VentaDiaria = {
  id: string
  fecha: string
  sucursal_id: string
  producto_id: string | null
  sku: string
  descripcion: string | null
  cantidad: number
  monto: number
  importado_de: string | null
  es_demo: boolean
  created_at: string
}

export type ItemSinMatch = {
  id: string
  import_job_id: string | null
  sku: string | null
  codigo: string | null
  barras: string | null
  descripcion_origen: string | null
  datos: Record<string, unknown>
  estado: EstadoSinMatch
  resuelto_producto_id: string | null
  es_demo: boolean
  created_at: string
  resuelto_at: string | null
}

// ===== Labels =====
export const TIPO_PERFIL_LABEL: Record<TipoPerfilDatos, string> = {
  productos: 'Productos (catálogo + stock + ventas mes)',
  stock: 'Stock',
  ventas: 'Ventas diarias',
  clientes: 'Clientes',
  ofertas: 'Ofertas / precios',
  dif_stock: 'Diferencias de stock',
  custom: 'Personalizado',
}

export const FRECUENCIA_LABEL: Record<FrecuenciaDatos, string> = {
  manual: 'Manual',
  cada_2hs: 'Cada 2 horas',
  diaria: 'Diaria',
  semanal: 'Semanal',
}

/** Horas de tolerancia antes de avisar "datos viejos" (mejora 5). */
export const FRECUENCIA_HORAS: Record<FrecuenciaDatos, number | null> = {
  manual: null,
  cada_2hs: 2,
  diaria: 24,
  semanal: 168,
}

/** Extensiones aceptadas por el importador (todas → SheetJS). */
export const FORMATOS_ACEPTADOS = '.xls,.xlsx,.csv,.txt'

export function formatoDeNombre(nombre: string): FormatoDatos {
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xls') return 'xls'
  if (ext === 'csv') return 'csv'
  if (ext === 'txt') return 'txt'
  return 'xlsx'
}
