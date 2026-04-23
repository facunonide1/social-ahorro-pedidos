/**
 * Tipos TypeScript del Admin Hub.
 *
 * Mirror manual del schema creado en
 * `supabase/migrations/0016_admin_hub_schema.sql`.
 *
 * Para regenerar desde Supabase en vez de mantener a mano:
 *   npx supabase gen types typescript \
 *     --project-id hrjxjbirajbsurobqdca \
 *     --schema public \
 *     > lib/types/db.generated.ts
 *
 * Esos tipos generados son exhaustivos pero menos ergonómicos;
 * este archivo expone sólo los tipos que usan los componentes.
 */

// ============ ENUMS ============

export type CondicionIva =
  | 'responsable_inscripto'
  | 'monotributo'
  | 'exento'
  | 'consumidor_final'

export type ContactoRol =
  | 'vendedor'
  | 'cobranzas'
  | 'logistica'
  | 'gerencia'
  | 'otro'

export type TipoCuentaBancaria = 'caja_ahorro' | 'cuenta_corriente'

export type ProveedorDocumentoTipo =
  | 'constancia_cuit'
  | 'certificado_iibb'
  | 'convenio'
  | 'lista_precios'
  | 'otro'

export type TipoFactura = 'A' | 'B' | 'C' | 'M'

export type FacturaEstado =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'programada_pago'
  | 'pagada_parcial'
  | 'pagada'
  | 'vencida'
  | 'rechazada'
  | 'anulada'

export type MetodoPago =
  | 'transferencia'
  | 'cheque'
  | 'echeq'
  | 'efectivo'
  | 'tarjeta'
  | 'otro'

export type PagoEstado =
  | 'solicitado'
  | 'aprobado'
  | 'ejecutado'
  | 'conciliado'
  | 'anulado'

export type RecepcionEstado =
  | 'completa'
  | 'parcial'
  | 'con_diferencias'
  | 'rechazada'

export type AdminRole =
  | 'super_admin'
  | 'gerente'
  | 'comprador'
  | 'administrativo'
  | 'tesoreria'
  | 'auditor'
  | 'sucursal'

export type NotificacionTipo = 'alerta' | 'tarea' | 'info' | 'aprobacion'
export type NotificacionPrioridad = 'baja' | 'media' | 'alta' | 'critica'

// ============ LABELS ============

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin:    'Super administrador',
  gerente:        'Gerente',
  comprador:      'Comprador',
  administrativo: 'Administrativo',
  tesoreria:      'Tesorería',
  auditor:        'Auditor',
  sucursal:       'Sucursal',
}

export const CONDICION_IVA_LABELS: Record<CondicionIva, string> = {
  responsable_inscripto: 'Responsable inscripto',
  monotributo:           'Monotributo',
  exento:                'Exento',
  consumidor_final:      'Consumidor final',
}

export const FACTURA_ESTADO_LABELS: Record<FacturaEstado, string> = {
  borrador:              'Borrador',
  pendiente_aprobacion:  'Pendiente aprobación',
  aprobada:              'Aprobada',
  programada_pago:       'Programada para pago',
  pagada_parcial:        'Pagada parcial',
  pagada:                'Pagada',
  vencida:               'Vencida',
  rechazada:             'Rechazada',
  anulada:               'Anulada',
}

export const PAGO_ESTADO_LABELS: Record<PagoEstado, string> = {
  solicitado: 'Solicitado',
  aprobado:   'Aprobado',
  ejecutado:  'Ejecutado',
  conciliado: 'Conciliado',
  anulado:    'Anulado',
}

export const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  transferencia: 'Transferencia',
  cheque:        'Cheque',
  echeq:         'e-Cheq',
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  otro:          'Otro',
}

export const RECEPCION_ESTADO_LABELS: Record<RecepcionEstado, string> = {
  completa:        'Completa',
  parcial:         'Parcial',
  con_diferencias: 'Con diferencias',
  rechazada:       'Rechazada',
}

export const NOTIFICACION_PRIORIDAD_LABELS: Record<NotificacionPrioridad, string> = {
  baja:     'Baja',
  media:    'Media',
  alta:     'Alta',
  critica:  'Crítica',
}

// ============ ENTIDADES ============

export type UserAdmin = {
  id: string
  rol: AdminRole
  sucursal_id: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type Sucursal = {
  id: string
  nombre: string
  codigo: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  horario_atencion: Record<string, any> | null
  latitud: number | null
  longitud: number | null
  responsable_id: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

export type Proveedor = {
  id: string
  razon_social: string
  nombre_comercial: string | null
  cuit: string
  condicion_iva: CondicionIva | null
  categoria: string | null
  domicilio_fiscal: string | null
  localidad: string | null
  provincia: string | null
  codigo_postal: string | null
  email_general: string | null
  telefono_general: string | null
  sitio_web: string | null
  logo_url: string | null
  plazo_pago_dias: number
  descuento_pronto_pago_pct: number
  minimo_compra: number
  frecuencia_visita_dias: number | null
  activo: boolean
  calificacion_interna: number | null
  notas: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type ProveedorContacto = {
  id: string
  proveedor_id: string
  nombre: string | null
  rol: ContactoRol | null
  telefono: string | null
  email: string | null
  whatsapp: string | null
  es_principal: boolean
  created_at: string
}

export type ProveedorCuentaBancaria = {
  id: string
  proveedor_id: string
  banco: string | null
  tipo_cuenta: TipoCuentaBancaria | null
  cbu: string | null
  alias: string | null
  titular: string | null
  cuit_titular: string | null
  es_principal: boolean
  created_at: string
}

export type ProveedorDocumento = {
  id: string
  proveedor_id: string
  tipo: ProveedorDocumentoTipo
  nombre: string | null
  archivo_url: string | null
  fecha_vencimiento: string | null
  created_at: string
  uploaded_by: string | null
}

export type FacturaProveedor = {
  id: string
  proveedor_id: string
  order_id: string | null
  sucursal_id: string | null
  tipo_factura: TipoFactura
  punto_venta: string
  numero_factura: string
  cae: string | null
  cae_vencimiento: string | null
  fecha_emision: string
  fecha_recepcion: string
  fecha_vencimiento: string
  subtotal: number
  iva_21: number
  iva_105: number
  iva_27: number
  percepciones: number
  retenciones: number
  total: number
  moneda: string
  estado: FacturaEstado
  observaciones: string | null
  archivo_pdf_url: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  approved_by: string | null
}

export type FacturaItem = {
  id: string
  factura_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  alicuota_iva: number
  created_at: string
}

export type Pago = {
  id: string
  proveedor_id: string
  numero_orden_pago: string | null
  fecha_pago: string
  metodo_pago: MetodoPago
  cuenta_bancaria_origen: string | null
  monto_total: number
  retenciones_aplicadas: number
  monto_neto: number
  moneda: string
  estado: PagoEstado
  comprobante_url: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
  solicitado_por: string | null
  aprobado_por: string | null
  ejecutado_por: string | null
}

export type PagoFactura = {
  id: string
  pago_id: string
  factura_id: string
  monto_aplicado: number
  created_at: string
}

export type RecepcionMercaderia = {
  id: string
  order_id: string | null
  sucursal_id: string | null
  numero_remito: string | null
  fecha_recepcion: string
  estado: RecepcionEstado
  observaciones: string | null
  recibido_por: string | null
  created_at: string
}

export type RecepcionItem = {
  id: string
  recepcion_id: string
  producto_id: string | null
  descripcion: string | null
  cantidad_pedida: number | null
  cantidad_recibida: number | null
  cantidad_danada: number
  fecha_vencimiento_producto: string | null
  observaciones: string | null
  foto_url: string | null
  created_at: string
}

export type AuditoriaLog = {
  id: string
  user_id: string | null
  accion: string
  entidad: string
  entidad_id: string | null
  datos_anteriores: Record<string, any> | null
  datos_nuevos: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export type NotificacionAdmin = {
  id: string
  user_id: string | null
  rol_destinatario: AdminRole | null
  tipo: NotificacionTipo
  titulo: string
  mensaje: string | null
  entidad_relacionada: string | null
  entidad_id: string | null
  leida: boolean
  url_accion: string | null
  prioridad: NotificacionPrioridad
  created_at: string
  read_at: string | null
}
