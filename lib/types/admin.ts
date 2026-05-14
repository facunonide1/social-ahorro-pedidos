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

/**
 * Departamentos del ERP.
 *
 * Usado por la nueva estructura `app/(admin)/`. Mientras no se aplique
 * la migración de roles v2, el mapeo `ROL_A_DEPARTAMENTOS_LEGACY`
 * traduce los roles actuales (v1) al set de departamentos accesibles.
 */
export type Departamento =
  | 'ejecutivo'
  | 'compras'
  | 'finanzas'
  | 'operaciones'
  | 'sucursales'
  | 'comercial'
  | 'clientes'
  | 'rrhh'
  | 'bi'

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

export const DEPARTAMENTO_LABELS: Record<Departamento, string> = {
  ejecutivo:    'Ejecutivo',
  compras:      'Compras',
  finanzas:     'Finanzas',
  operaciones:  'Operaciones',
  sucursales:   'Sucursales',
  comercial:    'Comercial',
  clientes:     'Clientes',
  rrhh:         'RRHH',
  bi:           'BI',
}

/**
 * Mapeo legacy: roles actuales (v1) → departamentos accesibles.
 *
 * Cuando se aplique el refactor de roles v2 con la tabla
 * `rol_departamento`, este mapeo lo reemplaza la consulta SQL. Este
 * objeto vive solo para que el sidebar y los hooks funcionen ANTES de
 * la migración.
 */
export const ROL_A_DEPARTAMENTOS_LEGACY: Record<AdminRole, Departamento[]> = {
  super_admin:    ['ejecutivo','compras','finanzas','operaciones','sucursales','comercial','clientes','rrhh','bi'],
  gerente:        ['ejecutivo','compras','finanzas','operaciones','sucursales','comercial','clientes','rrhh','bi'],
  auditor:        ['ejecutivo','compras','finanzas','operaciones','sucursales','comercial','clientes','rrhh','bi'],
  comprador:      ['compras'],
  administrativo: ['finanzas'],
  tesoreria:      ['finanzas'],
  sucursal:       ['sucursales'],
}

/**
 * Roles transversales que tienen acceso global, independientemente
 * de departamento o sucursal.
 */
export const ROLES_TRANSVERSALES: ReadonlyArray<AdminRole> = ['super_admin', 'gerente', 'auditor']

/**
 * Roles considerados "jefatura" en el modelo legacy.
 * Cuando llegue el refactor v2, esta lista se infiere de
 * `rol_departamento.es_jefe`.
 */
export const ROLES_JEFE_LEGACY: ReadonlyArray<AdminRole> = ['super_admin', 'gerente']

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

// ============ FINANZAS (migrations 0020-0023) ============

export type TipoCuentaPropia = 'caja_ahorro' | 'cuenta_corriente'
export type Moneda = 'ARS' | 'USD'
export type TipoMovimientoBancario =
  | 'ingreso'
  | 'egreso'
  | 'transferencia'
  | 'ajuste'

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimientoBancario, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  transferencia: 'Transferencia',
  ajuste: 'Ajuste',
}

export type CuentaBancariaPropia = {
  id: string
  nombre: string
  banco: string
  tipo_cuenta: TipoCuentaPropia
  cbu: string | null
  alias: string | null
  moneda: Moneda
  activa: boolean
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type CuentaBancariaConSaldo = CuentaBancariaPropia & {
  saldo_actual: number
  ultimo_movimiento_fecha: string | null
}

export type MovimientoBancario = {
  id: string
  cuenta_bancaria_id: string
  fecha: string
  tipo: TipoMovimientoBancario
  categoria: string | null
  monto: number
  descripcion: string | null
  referencia: string | null
  comprobante_url: string | null
  conciliado: boolean
  pago_id: string | null
  created_at: string
  created_by: string | null
}

export type TipoCheque = 'emitido' | 'recibido'
export type EstadoCheque =
  | 'emitido'
  | 'en_cartera'
  | 'depositado'
  | 'cobrado'
  | 'rechazado'
  | 'anulado'

export const ESTADO_CHEQUE_LABELS: Record<EstadoCheque, string> = {
  emitido: 'Emitido',
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  cobrado: 'Cobrado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
}

export type Cheque = {
  id: string
  tipo: TipoCheque
  numero: string
  banco: string
  cuenta: string | null
  monto: number
  fecha_emision: string
  fecha_cobro_estimada: string | null
  estado: EstadoCheque
  beneficiario_o_emisor: string | null
  proveedor_id: string | null
  cliente_id: string | null
  cuenta_bancaria_id: string | null
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export type TipoImpuesto =
  | 'iva'
  | 'iibb'
  | 'ganancias'
  | 'cargas_sociales'
  | 'monotributo'
  | 'otros'
export type EstadoImpuesto = 'pendiente' | 'presentado' | 'pagado' | 'vencido'

export const TIPO_IMPUESTO_LABELS: Record<TipoImpuesto, string> = {
  iva: 'IVA',
  iibb: 'Ingresos Brutos',
  ganancias: 'Ganancias',
  cargas_sociales: 'Cargas sociales',
  monotributo: 'Monotributo',
  otros: 'Otros',
}

export const ESTADO_IMPUESTO_LABELS: Record<EstadoImpuesto, string> = {
  pendiente: 'Pendiente',
  presentado: 'Presentado',
  pagado: 'Pagado',
  vencido: 'Vencido',
}

export type ImpuestoObligacion = {
  id: string
  tipo: TipoImpuesto
  periodo: string
  descripcion: string | null
  fecha_vencimiento: string
  monto_estimado: number | null
  monto_real: number | null
  estado: EstadoImpuesto
  comprobante_url: string | null
  notas: string | null
  pago_id: string | null
  created_at: string
  created_by: string | null
}

export type ExtractoLineaPendiente = {
  id: string
  cuenta_bancaria_id: string
  fecha: string
  monto: number
  descripcion: string | null
  referencia: string | null
  ingresada_en_extracto: string
  matched_movimiento_id: string | null
  estado: 'pendiente' | 'match_sugerido' | 'conciliado' | 'ignorado'
  created_at: string
  created_by: string | null
}

// ============ OPERACIONES / STOCK (migrations 0024-0025) ============

export type Producto = {
  id: string
  codigo_interno: string | null
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria: string | null
  laboratorio: string | null
  presentacion: string | null
  precio_costo: number | null
  precio_venta_sugerido: number | null
  iva_alicuota: number
  activo: boolean
  created_at: string
  updated_at: string
}

export type StockSucursal = {
  id: string
  producto_id: string
  sucursal_id: string
  cantidad_actual: number
  stock_minimo: number
  stock_maximo: number | null
  ubicacion: string | null
  ultima_actualizacion: string
}

export type TipoMovimientoStock =
  | 'entrada'
  | 'salida'
  | 'ajuste'
  | 'transferencia'
  | 'vencido'
  | 'devolucion'
  | 'inventario_alta'
  | 'inventario_baja'

export type MovimientoStock = {
  id: string
  producto_id: string
  sucursal_id: string
  tipo: TipoMovimientoStock
  cantidad: number
  motivo: string | null
  referencia_tipo: string | null
  referencia_id: string | null
  fecha: string
  created_by: string | null
  created_at: string
}

export type LoteProducto = {
  id: string
  producto_id: string
  sucursal_id: string
  numero_lote: string | null
  fecha_vencimiento: string
  cantidad_actual: number
  recepcion_id: string | null
  created_at: string
}

export type EstadoTransferencia =
  | 'solicitada'
  | 'aprobada'
  | 'en_transito'
  | 'recibida'
  | 'cancelada'

export const ESTADO_TRANSFERENCIA_LABELS: Record<EstadoTransferencia, string> = {
  solicitada: 'Solicitada',
  aprobada: 'Aprobada',
  en_transito: 'En tránsito',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
}

export type TransferenciaSucursal = {
  id: string
  sucursal_origen_id: string
  sucursal_destino_id: string
  estado: EstadoTransferencia
  fecha_solicitud: string
  fecha_envio: string | null
  fecha_recepcion: string | null
  solicitado_por: string | null
  aprobado_por: string | null
  observaciones: string | null
  created_at: string
}

export type EstadoInventario = 'en_curso' | 'cerrado'

export type InventarioFisico = {
  id: string
  sucursal_id: string
  fecha_inventario: string
  estado: EstadoInventario
  responsable_id: string | null
  total_items_contados: number
  diferencias_detectadas: number
  observaciones: string | null
  created_at: string
  closed_at: string | null
}

export type EstadoDevolucionProveedor =
  | 'registrada'
  | 'enviada'
  | 'nota_credito_recibida'
  | 'cerrada'
export type MotivoDevolucion = 'vencimiento' | 'dano' | 'error_pedido' | 'otro'

export const ESTADO_DEVOLUCION_LABELS: Record<EstadoDevolucionProveedor, string> = {
  registrada: 'Registrada',
  enviada: 'Enviada',
  nota_credito_recibida: 'Nota de crédito recibida',
  cerrada: 'Cerrada',
}

export const MOTIVO_DEVOLUCION_LABELS: Record<MotivoDevolucion, string> = {
  vencimiento: 'Vencimiento',
  dano: 'Daño',
  error_pedido: 'Error de pedido',
  otro: 'Otro',
}

export type DevolucionProveedor = {
  id: string
  proveedor_id: string
  sucursal_id: string
  fecha: string
  motivo: MotivoDevolucion
  estado: EstadoDevolucionProveedor
  numero_remito_devolucion: string | null
  observaciones: string | null
  created_at: string
  created_by: string | null
}

// ============ IA / TICKETS (migration 0027) ============

export type EstadoTicketValidacion =
  | 'pendiente'
  | 'auto_validado'
  | 'manual_aprobado'
  | 'rechazado'
  | 'dudoso'

export const ESTADO_TICKET_LABELS: Record<EstadoTicketValidacion, string> = {
  pendiente: 'Pendiente',
  auto_validado: 'Validado automático',
  manual_aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  dudoso: 'Dudoso',
}

export type TicketValidacion = {
  id: string
  cliente_dni: string | null
  cliente_telefono: string | null
  cliente_id: string | null
  foto_url: string
  hash_imagen: string | null
  fecha_carga: string
  fecha_ticket_extraida: string | null
  total_extraido: number | null
  sucursal_extraida: string | null
  numero_ticket_extraido: string | null
  raw_ocr: Record<string, any> | null
  estado: EstadoTicketValidacion
  puntos_asignados: number | null
  validado_por: string | null
  validado_at: string | null
  observaciones: string | null
}
