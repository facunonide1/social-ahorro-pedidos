/**
 * Tipos del MOTOR DE DOCUMENTOS (migración 0082).
 * Mirror de las tablas `public.doc_*`.
 *
 * Vocabulario NEUTRO a propósito: este motor se reutiliza en otros rubros.
 *   tercero           → quien emite el documento (en Social Ahorro: proveedores)
 *   item              → renglón del catálogo     (en Social Ahorro: productos_catalogo)
 *   unidad de negocio → quién compra             (en Social Ahorro: sucursales)
 *
 * El motor no conoce lotes, vencimientos, recetas ni psicotrópicos: esa lógica
 * se conecta encima, vía las FK opcionales.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type TipoDocumento =
  | 'factura'
  | 'remito'
  | 'nota_credito'
  | 'nota_debito'
  | 'presupuesto'
  | 'orden'

export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  'factura',
  'remito',
  'nota_credito',
  'nota_debito',
  'presupuesto',
  'orden',
]

export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  factura: 'Factura',
  remito: 'Remito',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  presupuesto: 'Presupuesto',
  orden: 'Orden',
}

export type EstadoDocumento =
  | 'borrador'
  | 'en_revision'
  | 'confirmado'
  | 'rechazado'
  | 'anulado'

export const ESTADOS_DOCUMENTO: EstadoDocumento[] = [
  'borrador',
  'en_revision',
  'confirmado',
  'rechazado',
  'anulado',
]

export const ESTADO_DOCUMENTO_LABELS: Record<EstadoDocumento, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
}

export type MatchEstado =
  | 'pendiente'
  | 'automatico'
  | 'manual'
  | 'sin_match'
  | 'ignorado'

export const MATCH_ESTADOS: MatchEstado[] = [
  'pendiente',
  'automatico',
  'manual',
  'sin_match',
  'ignorado',
]

export const MATCH_ESTADO_LABELS: Record<MatchEstado, string> = {
  pendiente: 'Pendiente',
  automatico: 'Match automático',
  manual: 'Match manual',
  sin_match: 'Sin match',
  ignorado: 'Ignorado',
}

/** Origen de un alias de item o de tercero. */
export type OrigenAlias = 'manual' | 'automatico' | 'sugerido'

/** De dónde salió un evento de precio. La FACTURA es la autoridad. */
export type OrigenPrecio =
  | 'factura'
  | 'remito'
  | 'lista_precios'
  | 'manual'
  | 'orden_compra'

export const ORIGENES_PRECIO: OrigenPrecio[] = [
  'factura',
  'remito',
  'lista_precios',
  'manual',
  'orden_compra',
]

export const ORIGEN_PRECIO_LABELS: Record<OrigenPrecio, string> = {
  factura: 'Factura',
  remito: 'Remito',
  lista_precios: 'Lista de precios',
  manual: 'Carga manual',
  orden_compra: 'Orden de compra',
}

export type EstadoConciliacion =
  | 'abierta'
  | 'conciliada'
  | 'con_diferencias'
  | 'cerrada_manual'

export const ESTADOS_CONCILIACION: EstadoConciliacion[] = [
  'abierta',
  'conciliada',
  'con_diferencias',
  'cerrada_manual',
]

export const ESTADO_CONCILIACION_LABELS: Record<EstadoConciliacion, string> = {
  abierta: 'Abierta',
  conciliada: 'Conciliada',
  con_diferencias: 'Con diferencias',
  cerrada_manual: 'Cerrada a mano',
}

/** Las tres diferencias que importan en una conciliación. */
export type TipoDiferencia =
  | 'cantidad_faltante' // ordenaste 20, entregaron 18
  | 'facturado_de_mas' // entregaron 18, facturaron 20
  | 'precio_distinto' // pactado $1.200, facturado $1.340

export const TIPO_DIFERENCIA_LABELS: Record<TipoDiferencia, string> = {
  cantidad_faltante: 'Cantidad faltante',
  facturado_de_mas: 'Facturado de más',
  precio_distinto: 'Precio distinto al pactado',
}

// ── Campos comunes a toda tabla del motor ────────────────────────────────────

/** UUID del tenant 1 (Social Ahorro). Espejo de `public.doc_tenant_actual()`. */
export const TENANT_ACTUAL = '00000000-0000-0000-0000-000000000001'

type BaseMotor = {
  id: string
  tenant_id: string
  created_at: string
  updated_at: string
  created_by: string | null
}

// ── Tablas ───────────────────────────────────────────────────────────────────

/** `doc_documentos` — un documento comercial recibido de un tercero. */
export type DocumentoComercial = BaseMotor & {
  tipo: TipoDocumento
  estado: EstadoDocumento
  /** FK a `proveedores`. Null mientras no se identifique al tercero. */
  tercero_id: string | null
  /** CUIT tal como se leyó. Es la clave real de identificación. */
  tercero_ident_fiscal: string | null
  /** Razón social tal como figura en el papel. */
  tercero_nombre_leido: string | null
  numero: string | null
  punto_venta: string | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  /** FK a `sucursales`. Es la COMPRADORA: tiene impacto fiscal. */
  unidad_negocio_id: string | null
  moneda: string
  subtotal: number | null
  descuentos: number | null
  impuestos: number | null
  percepciones: number | null
  total: number | null
  observaciones: string | null
  /** Nota de crédito → su factura. */
  documento_padre_id: string | null
  confirmado_por: string | null
  confirmado_at: string | null
}

/** `doc_lineas` — cada renglón del documento. */
export type LineaDocumento = BaseMotor & {
  documento_id: string
  nro_linea: number
  codigo_tercero: string | null
  /** Como figura en el papel, sin normalizar. */
  descripcion_leida: string
  cantidad: number | null
  unidad: string | null
  /** Bruto de la línea. */
  precio_unitario: number | null
  descuento_pct: number | null
  descuento_monto: number | null
  /** Sin IVA. Se guarda junto con `precio_con_iva`: no se puede reconstruir después. */
  precio_neto: number | null
  alicuota_iva: number | null
  precio_con_iva: number | null
  total_linea: number | null
  /** FK a `productos_catalogo`. */
  item_id: string | null
  match_estado: MatchEstado
  /** 0.000 a 1.000 */
  match_confianza: number | null
}

/** `doc_extracciones` — lo que devolvió el modelo, crudo. Una fila por intento. */
export type ExtraccionDocumento = BaseMotor & {
  documento_id: string | null
  /** Path dentro del bucket `documentos-comerciales`. */
  archivo_path: string
  /** Anti-duplicados por imagen. */
  archivo_hash: string | null
  mime_type: string | null
  modelo: string | null
  prompt_version: string | null
  /** Salida completa del modelo, sin recortar: permite reprocesar sin pedir la foto de nuevo. */
  respuesta_cruda: unknown
  confianza_global: number | null
  /** `{ campo: confianza }` */
  campos_dudosos: Record<string, number> | null
  error: string | null
  procesado_at: string | null
}

/** `doc_terceros_alias` — cómo se escribe el mismo tercero en distintos papeles. */
export type AliasTercero = BaseMotor & {
  /** CUIT: la clave real. El nombre cambia, el CUIT no. */
  ident_fiscal: string
  nombre_variante: string
  tercero_id: string | null
  origen: Exclude<OrigenAlias, 'sugerido'> | null
  veces_visto: number
}

/**
 * `doc_items_alias` — cómo cada tercero nombra un item → item del catálogo propio.
 * Es el activo del motor: lo que hace que mejore con el uso.
 */
export type AliasItem = BaseMotor & {
  tercero_id: string | null
  /** Redundante a propósito: sobrevive al alta/baja del tercero. */
  ident_fiscal: string | null
  codigo_tercero: string | null
  descripcion_tercero: string
  /** Normalizada para búsqueda por similitud (índice GIN trigram). */
  descripcion_norm: string
  /** FK a `productos_catalogo`. */
  item_id: string
  origen: OrigenAlias
  confianza: number | null
  veces_usado: number
  ultima_vez: string | null
  activo: boolean
}

/**
 * `doc_precios_historial` — el histórico como SERIE DE EVENTOS.
 * Nunca se pisa el precio anterior: "último precio" es una consulta, no una columna.
 */
export type EventoPrecio = BaseMotor & {
  item_id: string
  tercero_id: string | null
  documento_id: string | null
  linea_id: string | null
  fecha: string
  cantidad: number | null
  unidad: string | null
  /** Bruto. */
  precio_unitario: number
  precio_neto: number | null
  precio_con_iva: number | null
  descuento_pct: number | null
  moneda: string
  unidad_negocio_id: string | null
  origen: OrigenPrecio
}

/** Una diferencia detectada en una conciliación (elemento del jsonb `diferencias`). */
export type DiferenciaConciliacion = {
  tipo: TipoDiferencia
  item_id?: string | null
  descripcion?: string | null
  esperado?: number | null
  recibido?: number | null
  monto?: number | null
}

/** `doc_conciliaciones` — el cruce de tres puntas: orden ↔ remito ↔ factura. */
export type Conciliacion = BaseMotor & {
  /** FK a `ordenes_compra`. */
  orden_id: string | null
  remito_id: string | null
  factura_id: string | null
  estado: EstadoConciliacion
  diferencias: DiferenciaConciliacion[]
  monto_diferencia: number | null
  resuelto_por: string | null
  resuelto_at: string | null
  nota: string | null
}

// ── Vista ────────────────────────────────────────────────────────────────────

/**
 * `doc_v_ultimo_precio` — último precio por (item, tercero) con su variación
 * contra el evento anterior. Es lo que va a consumir el comparador multidroguería.
 */
export type UltimoPrecio = {
  tenant_id: string
  item_id: string
  tercero_id: string | null
  fecha: string
  precio_unitario: number
  precio_neto: number | null
  precio_con_iva: number | null
  moneda: string
  unidad_negocio_id: string | null
  documento_id: string | null
  origen: OrigenPrecio
  precio_anterior: number | null
  fecha_anterior: string | null
  variacion_monto: number | null
  /** Porcentaje con 2 decimales. Null si no hay evento anterior. */
  variacion_pct: number | null
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Bucket privado donde vive la imagen original (la prueba ante el tercero). */
export const BUCKET_DOCUMENTOS_COMERCIALES = 'documentos-comerciales'
