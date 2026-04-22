import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, TIPO_ENVIO_LABELS, ORIGIN_LABELS } from '@/lib/types'
import type { OrderStatus, TipoEnvio } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PENDIENTES: OrderStatus[] = ['nuevo','confirmado','en_preparacion','listo']

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

function startOfDayISO(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString() }
function endOfDayISO(d = new Date())   { const x = new Date(d); x.setHours(23,59,59,999); return x.toISOString() }

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()
  if (!profile?.active || !['admin','operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  // Mismos filtros que el dashboard (q/status/scope/zona/tipo/rep/date/fuera)
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const statusRaw = (sp.get('status') || '').trim()
  const zona  = (sp.get('zona') || '').trim() || undefined
  const tipo  = sp.get('tipo') as TipoEnvio | null
  const rep   = (sp.get('rep')  || '').trim() || undefined
  const date  = (sp.get('date') || '').trim()
  const scope = sp.get('scope') === 'all' ? 'all' : 'today'
  const fuera = sp.get('fuera') === '1'

  const useDate = !!date
  const fromISO = useDate ? startOfDayISO(new Date(date + 'T00:00:00'))
                 : scope === 'today' ? startOfDayISO() : null
  const toISO   = useDate ? endOfDayISO(new Date(date + 'T00:00:00')) : null

  let query = sb
    .from('orders')
    .select('*, zonas_reparto(nombre), assigned:assigned_to(name, email)')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (fromISO) query = query.gte('created_at', fromISO)
  if (toISO)   query = query.lte('created_at', toISO)
  if (statusRaw === 'pendientes') query = query.in('status', PENDIENTES)
  else if (statusRaw) query = query.eq('status', statusRaw)
  if (zona === 'sin_zona') query = query.is('zona_id', null)
  else if (zona) query = query.eq('zona_id', zona)
  if (tipo && ['express','programado','retiro'].includes(tipo)) query = query.eq('tipo_envio', tipo)
  if (rep === 'sin_asignar') query = query.is('assigned_to', null)
  else if (rep) query = query.eq('assigned_to', rep)
  if (fuera) query = query.eq('fuera_de_horario', true).not('status', 'in', '(entregado,cancelado)')
  if (q) {
    const like = `%${q}%`
    const orFilters = [
      `codigo.ilike.${like}`,
      `customer_name.ilike.${like}`,
      `customer_phone.ilike.${like}`,
      `customer_email.ilike.${like}`,
      `customer_dni.ilike.${like}`,
    ]
    const asNumber = Number(q.replace(/\D/g, ''))
    if (Number.isFinite(asNumber) && asNumber > 0) {
      orFilters.push(`woo_order_id.eq.${asNumber}`)
      orFilters.push(`manual_order_number.eq.${asNumber}`)
    }
    query = query.or(orFilters.join(','))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = [
    'Código', 'Fecha', 'Estado', 'Tipo envío', 'Origen', 'Fuera horario',
    'Cliente', 'Teléfono', 'DNI', 'Email',
    'Dirección', 'Ciudad', 'CP', 'Zona', 'Repartidor',
    'Items (cantidad)', 'Items (detalle)',
    'Total', 'Método pago', 'Notas',
  ]

  const lines: string[] = [csvRow(header)]
  for (const o of (data ?? []) as any[]) {
    const items = Array.isArray(o.items) ? o.items : []
    const detalle = items.map((it: any) => `${it.qty}x ${it.name}${it.sku ? ` [${it.sku}]` : ''} @${it.price}`).join(' | ')
    const sh = o.shipping_address || o.billing_address || {}
    lines.push(csvRow([
      o.codigo,
      new Date(o.woo_created_at || o.created_at).toISOString(),
      STATUS_LABELS[o.status as OrderStatus] ?? o.status,
      TIPO_ENVIO_LABELS[o.tipo_envio as TipoEnvio] ?? o.tipo_envio,
      ORIGIN_LABELS[o.origin as keyof typeof ORIGIN_LABELS] ?? o.origin,
      o.fuera_de_horario ? 'sí' : 'no',
      o.customer_name,
      o.customer_phone,
      o.customer_dni,
      o.customer_email,
      [sh.address_1, sh.address_2].filter(Boolean).join(' '),
      sh.city,
      sh.postcode,
      o.zonas_reparto?.nombre ?? '',
      o.assigned?.name ?? o.assigned?.email ?? '',
      items.length,
      detalle,
      Number(o.total || 0).toFixed(2),
      o.payment_method,
      o.notes,
    ]))
  }

  const csv = '﻿' + lines.join('\n')  // BOM para Excel
  const filename = `pedidos-${new Date().toISOString().slice(0,10)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
