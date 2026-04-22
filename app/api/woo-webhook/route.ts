import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import type { WooOrder } from '@/lib/woo/client'
import type { OrderItem, TipoEnvio } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Webhook receptor de WooCommerce para order.created.
 * Inserta el pedido en public.orders saltándose la espera del cron.
 *
 * Configuración en WooCommerce:
 *   Ajustes → Avanzado → Webhooks → Añadir webhook
 *     - Tema: "Pedido creado"
 *     - URL de entrega: https://<tu-app>/api/woo-webhook
 *     - Secreto: el valor de WOO_WEBHOOK_SECRET
 *     - Versión API: WP REST API Integration v3
 *
 * Woo firma el body con HMAC-SHA256 + base64 en el header
 * `x-wc-webhook-signature`. Validamos la firma antes de procesar.
 */

function pickTipoEnvio(o: WooOrder): TipoEnvio {
  const raw = ((o.shipping_lines ?? [])
    .map(l => `${l.method_id ?? ''} ${l.method_title ?? ''}`)
    .join(' ') || '').toLowerCase()
  if (raw.includes('express')) return 'express'
  if (raw.includes('pickup') || raw.includes('retiro') || raw.includes('local_pickup')) return 'retiro'
  return 'programado'
}

function isFueraDeHorario(iso: string | null | undefined, open: number, close: number): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const hour = Number(d.toLocaleString('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false,
  }))
  return hour < open || hour >= close
}

function mapItems(items: WooOrder['line_items']): OrderItem[] {
  return items.map(it => ({
    product_id: it.product_id,
    name: it.name,
    qty: it.quantity,
    price: Number(it.price) || Number(it.total) / Math.max(1, it.quantity),
    sku: it.sku || undefined,
    meta: it.meta_data?.length ? { meta_data: it.meta_data } : undefined,
  }))
}

export async function POST(req: NextRequest) {
  const secret = process.env.WOO_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 500 })
  }

  // Leemos body como raw para poder calcular la firma exactamente igual
  const raw = await req.text()
  const sig = req.headers.get('x-wc-webhook-signature') || ''
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64')
  if (sig !== expected) {
    return NextResponse.json({ error: 'firma_invalida' }, { status: 401 })
  }

  let o: WooOrder
  try { o = JSON.parse(raw) as WooOrder }
  catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  if (!o?.id) return NextResponse.json({ ok: true, skipped: 'sin_id' })

  const admin = createAdminClient()

  // Si ya existe, es un ping de re-entrega: idempotente
  const { data: existing } = await admin
    .from('orders').select('id').eq('woo_order_id', o.id).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, skipped: 'ya_existe' })

  // Horarios configurados
  const { data: s } = await admin
    .from('app_settings').select('hora_apertura, hora_cierre').eq('id', 1).maybeSingle()
  const horaApertura = s?.hora_apertura ?? 8
  const horaCierre   = s?.hora_cierre   ?? 20

  const name  = `${o.shipping?.first_name || o.billing?.first_name || ''} ${o.shipping?.last_name || o.billing?.last_name || ''}`.trim() || null
  const phone = o.shipping?.phone || o.billing?.phone || null
  const email = (o.billing?.email || '').toLowerCase() || null
  const shipping = o.shipping ?? null
  const billing  = o.billing  ?? null

  // Match o crea customer
  let customerId: string | null = null
  if (phone) {
    const { data } = await admin.from('customers').select('id').eq('phone', phone).limit(1).maybeSingle()
    if (data) customerId = data.id
  }
  if (!customerId && email) {
    const { data } = await admin.from('customers').select('id').eq('email', email).limit(1).maybeSingle()
    if (data) customerId = data.id
  }
  if (!customerId) {
    const { data: created } = await admin
      .from('customers')
      .insert({ name, phone, email, address: shipping || billing })
      .select('id').maybeSingle()
    customerId = created?.id ?? null
  }

  const wooCreated = o.date_created_gmt ? new Date(`${o.date_created_gmt}Z`).toISOString() : null
  const { error: insErr } = await admin.from('orders').insert({
    woo_order_id: o.id,
    origin: 'woo' as const,
    tipo_envio: pickTipoEnvio(o),
    fuera_de_horario: isFueraDeHorario(wooCreated, horaApertura, horaCierre),
    status: 'nuevo' as const,
    customer_id: customerId,
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    shipping_address: shipping,
    billing_address:  billing,
    total: Number(o.total) || 0,
    payment_method: o.payment_method_title || o.payment_method || null,
    items: mapItems(o.line_items ?? []),
    notes: o.customer_note || null,
    woo_created_at: wooCreated,
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, created: true })
}

// Woo puede mandar un GET para ping de verificación
export async function GET() {
  return NextResponse.json({ ok: true, info: 'Social Ahorro webhook endpoint' })
}
