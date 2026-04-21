import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchWooCustomers } from '@/lib/woo/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type CustomerSuggestion = {
  source: 'local' | 'woo'
  name: string | null
  phone: string | null
  email: string | null
  dni: string | null
  address: {
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  } | null
}

function normalizeKey(s: string | null | undefined) {
  return (s ?? '').replace(/\D/g, '').toLowerCase()
}

function customerKey(c: Pick<CustomerSuggestion, 'phone' | 'email' | 'dni' | 'name'>) {
  return (
    normalizeKey(c.dni)
    || normalizeKey(c.phone)
    || (c.email || '').toLowerCase()
    || (c.name  || '').toLowerCase()
  )
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
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
  if (q.length < 2) return NextResponse.json([])

  const like = `%${q}%`

  // 1) Búsqueda en orders locales (pedidos Woo ya sincronizados + manuales)
  const { data: localOrders } = await sb
    .from('orders')
    .select('customer_name, customer_phone, customer_email, customer_dni, shipping_address, billing_address, created_at')
    .or(`customer_name.ilike.${like},customer_phone.ilike.${like},customer_email.ilike.${like},customer_dni.ilike.${like}`)
    .order('created_at', { ascending: false })
    .limit(80)

  const seen = new Set<string>()
  const locals: CustomerSuggestion[] = []
  for (const o of localOrders ?? []) {
    const suggestion: CustomerSuggestion = {
      source: 'local',
      name:  o.customer_name,
      phone: o.customer_phone,
      email: o.customer_email,
      dni:   o.customer_dni,
      address: (o.shipping_address as any) || (o.billing_address as any) || null,
    }
    const key = customerKey(suggestion)
    if (!key || seen.has(key)) continue
    seen.add(key)
    locals.push(suggestion)
    if (locals.length >= 10) break
  }

  // 2) Búsqueda en clientes de Woo (por si todavía no está sincronizado acá)
  const wooCustomers = await searchWooCustomers(q, 10)
  const wooList: CustomerSuggestion[] = wooCustomers.map(c => {
    const full = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.username || ''
    return {
      source: 'woo',
      name: full || null,
      phone: c.billing?.phone || null,
      email: c.email || null,
      dni: null, // Woo no tiene DNI estándar
      address: (c.shipping && Object.keys(c.shipping).length ? c.shipping : c.billing) as any || null,
    }
  })

  // Dedupe Woo contra locales por DNI / teléfono / email
  const out: CustomerSuggestion[] = [...locals]
  for (const w of wooList) {
    const key = customerKey(w)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(w)
    if (out.length >= 15) break
  }

  return NextResponse.json(out)
}
