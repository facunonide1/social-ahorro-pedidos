import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus, TipoEnvio } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type SearchResult = {
  orders: Array<{
    id: string
    codigo: string
    customer_name: string | null
    status: OrderStatus
    tipo_envio: TipoEnvio
    total: number
  }>
  customers: Array<{
    id: string
    name: string | null
    phone: string | null
    email: string | null
    dni: string | null
  }>
  proveedores: Array<{
    id: string
    razon_social: string
    nombre_comercial: string | null
    cuit: string
  }>
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2)
    return NextResponse.json({ orders: [], customers: [], proveedores: [] } satisfies SearchResult)

  const like = `%${q}%`
  const orFiltersOrders = [
    `codigo.ilike.${like}`,
    `customer_name.ilike.${like}`,
    `customer_phone.ilike.${like}`,
    `customer_email.ilike.${like}`,
    `customer_dni.ilike.${like}`,
  ]
  const asNumber = Number(q.replace(/\D/g, ''))
  if (Number.isFinite(asNumber) && asNumber > 0) {
    orFiltersOrders.push(`woo_order_id.eq.${asNumber}`)
    orFiltersOrders.push(`manual_order_number.eq.${asNumber}`)
  }

  const [ordersRes, customersRes, proveedoresRes] = await Promise.all([
    sb
      .from('orders')
      .select('id, codigo, customer_name, status, tipo_envio, total')
      .or(orFiltersOrders.join(','))
      .order('created_at', { ascending: false })
      .limit(10),
    sb
      .from('customers')
      .select('id, name, phone, email, dni')
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like},dni.ilike.${like}`)
      .order('updated_at', { ascending: false })
      .limit(10),
    sb
      .from('proveedores')
      .select('id, razon_social, nombre_comercial, cuit')
      .or(`razon_social.ilike.${like},nombre_comercial.ilike.${like},cuit.ilike.${like}`)
      .eq('activo', true)
      .order('razon_social', { ascending: true })
      .limit(10),
  ])

  return NextResponse.json({
    orders: (ordersRes.data ?? []) as SearchResult['orders'],
    customers: (customersRes.data ?? []) as SearchResult['customers'],
    proveedores: (proveedoresRes.data ?? []) as SearchResult['proveedores'],
  } satisfies SearchResult)
}
