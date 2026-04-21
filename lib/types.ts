export type OrderStatus =
  | 'nuevo'
  | 'confirmado'
  | 'en_preparacion'
  | 'listo'
  | 'en_camino'
  | 'entregado'
  | 'cancelado'

export type UserRole = 'admin' | 'operador' | 'repartidor'

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
  woo_order_id: number
  status: OrderStatus
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  shipping_address: Record<string, any> | null
  billing_address: Record<string, any> | null
  total: number
  payment_method: string | null
  items: OrderItem[]
  notes: string | null
  assigned_to: string | null
  woo_created_at: string | null
  created_at: string
  updated_at: string
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
