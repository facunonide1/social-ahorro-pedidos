export type OrderStatus =
  | 'nuevo'
  | 'confirmado'
  | 'en_preparacion'
  | 'listo'
  | 'en_camino'
  | 'entregado'
  | 'cancelado'

export type OrderOrigin = 'woo' | 'whatsapp' | 'telefono' | 'instagram' | 'otro'

export type TipoEnvio = 'express' | 'programado' | 'retiro'

export type UserRole = 'admin' | 'operador' | 'repartidor'

export type ZonaReparto = {
  id: string
  nombre: string
  descripcion: string | null
  barrios: string[]
  color: string
  activa: boolean
  created_at: string
  updated_at: string
}

export type AppSettings = {
  id: 1
  hora_apertura: number
  hora_cierre: number
  updated_at: string
}

export type OrderItem = {
  product_id?: number
  name: string
  qty: number
  price: number
  sku?: string
  meta?: Record<string, unknown>
}

export type Order = {
  id: string
  codigo: string
  woo_order_id: number | null
  manual_order_number: number | null
  origin: OrderOrigin
  tipo_envio: TipoEnvio
  fuera_de_horario: boolean
  status: OrderStatus
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_dni: string | null
  shipping_address: Record<string, any> | null
  billing_address: Record<string, any> | null
  total: number
  payment_method: string | null
  items: OrderItem[]
  notes: string | null
  assigned_to: string | null
  zona_id: string | null
  woo_created_at: string | null
  woo_last_sync_status: string | null
  woo_last_sync_at: string | null
  woo_last_sync_error: string | null
  confirmed_at: string | null
  ready_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export const ORIGIN_LABELS: Record<OrderOrigin, string> = {
  woo: 'Web',
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  instagram: 'Instagram',
  otro: 'Otro',
}

export const MANUAL_ORIGIN_PREFIX: Record<Exclude<OrderOrigin, 'woo'>, string> = {
  whatsapp: 'WSP',
  telefono: 'TEL',
  instagram: 'IG',
  otro: 'M',
}

export const TIPO_ENVIO_LABELS: Record<TipoEnvio, string> = {
  express: 'Express',
  programado: 'Programado',
  retiro: 'Retiro en tienda',
}

export const TIPO_ENVIO_COLORS: Record<TipoEnvio, { bg: string; fg: string; border: string }> = {
  express:    { bg: '#fff0f0', fg: '#FF6D6E', border: '#FF6D6E' },
  programado: { bg: '#eeedff', fg: '#726DFF', border: '#726DFF' },
  retiro:     { bg: '#eaf7ef', fg: '#1f8a4c', border: '#6FEF6C' },
}

/**
 * Flujo de estados permitidos por tipo de envío.
 * La UI solo muestra botones para las transiciones válidas según el tipo.
 */
export const TIPO_ENVIO_FLOW: Record<TipoEnvio, OrderStatus[]> = {
  express:    ['nuevo', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'],
  programado: ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'],
  retiro:     ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'entregado', 'cancelado'],
}

export type OrderStatusHistory = {
  id: string
  order_id: string
  status: OrderStatus
  changed_by: string | null
  note: string | null
  created_at: string
}

export type UserPedidos = {
  id: string
  email: string
  name: string | null
  role: UserRole
  active: boolean
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const STATUS_ORDER: OrderStatus[] = [
  'nuevo',
  'confirmado',
  'en_preparacion',
  'listo',
  'en_camino',
  'entregado',
  'cancelado',
]

export const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string; border: string }> = {
  nuevo:          { bg: '#fff0f0', fg: '#FF6D6E', border: '#FF6D6E' },
  confirmado:     { bg: '#eeedff', fg: '#726DFF', border: '#726DFF' },
  en_preparacion: { bg: '#fff7ec', fg: '#c6831a', border: '#edc989' },
  listo:          { bg: '#eaf7ef', fg: '#1f8a4c', border: '#8fd1a8' },
  en_camino:      { bg: '#e9f0ff', fg: '#2855c7', border: '#9cb6ee' },
  entregado:      { bg: '#f0f0f0', fg: '#555',    border: '#d4d4d4' },
  cancelado:      { bg: '#fbeaea', fg: '#a33',    border: '#e0a8a8' },
}
