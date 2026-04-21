/**
 * Cliente minimo de WooCommerce REST API v3.
 */

import type { OrderStatus } from '@/lib/types'

type WooQuery = Record<string, string | number | undefined>

export type WooOrderStatus =
  | 'pending' | 'processing' | 'on-hold'
  | 'completed' | 'cancelled' | 'refunded' | 'failed'

/** Mapeo de estados de la app a estados de Woo (Opción A). */
export function mapStatusToWoo(s: OrderStatus): WooOrderStatus {
  switch (s) {
    case 'nuevo':          return 'pending'
    case 'confirmado':
    case 'en_preparacion':
    case 'listo':
    case 'en_camino':      return 'processing'
    case 'entregado':      return 'completed'
    case 'cancelado':      return 'cancelled'
  }
}

function authHeader() {
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY!
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET!
  const token = Buffer.from(`${key}:${secret}`).toString('base64')
  return `Basic ${token}`
}

function buildUrl(path: string, query: WooQuery = {}) {
  const base = process.env.WOOCOMMERCE_URL!.replace(/\/$/, '')
  const url = new URL(`${base}/wp-json/wc/v3${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function wooFetch<T>(path: string, query: WooQuery = {}): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Woo ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export type WooAddress = {
  first_name?: string
  last_name?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  phone?: string
  email?: string
}

export type WooLineItem = {
  id: number
  product_id: number
  name: string
  quantity: number
  price: string | number
  sku?: string
  total?: string
  meta_data?: Array<{ key: string; value: unknown; display_key?: string; display_value?: string }>
}

export type WooOrder = {
  id: number
  status: string
  date_created: string
  date_created_gmt: string
  date_modified: string
  total: string
  currency: string
  payment_method: string
  payment_method_title: string
  customer_note: string
  billing: WooAddress
  shipping: WooAddress
  line_items: WooLineItem[]
}

export async function fetchOrders(params: {
  perPage?: number
  page?: number
  after?: string
  modifiedAfter?: string
  status?: string
} = {}): Promise<WooOrder[]> {
  return wooFetch<WooOrder[]>('/orders', {
    per_page: params.perPage ?? 50,
    page: params.page ?? 1,
    after: params.after,
    modified_after: params.modifiedAfter,
    status: params.status,
    orderby: 'date',
    order: 'desc',
  })
}

export async function fetchOrder(id: number): Promise<WooOrder> {
  return wooFetch<WooOrder>(`/orders/${id}`)
}

/**
 * Actualiza el status de un pedido en Woo.
 * Woo dispara sus mails automáticos según su config cuando el status cambia.
 */
export async function updateWooOrderStatus(id: number, status: WooOrderStatus): Promise<void> {
  const res = await fetch(buildUrl(`/orders/${id}`), {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ status }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Woo PUT ${res.status}: ${body.slice(0, 300)}`)
  }
}

export type WooCustomer = {
  id: number
  email: string
  first_name: string
  last_name: string
  username: string
  billing: WooAddress
  shipping: WooAddress
}

export async function searchWooCustomers(q: string, perPage = 10): Promise<WooCustomer[]> {
  const search = q.trim()
  if (!search) return []
  try {
    return await wooFetch<WooCustomer[]>('/customers', {
      search,
      per_page: perPage,
      role: 'all',
    })
  } catch {
    return []
  }
}
