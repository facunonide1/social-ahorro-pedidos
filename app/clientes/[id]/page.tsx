import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_COLORS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS } from '@/lib/types'
import type { Customer, Order, UserPedidos } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'
import { formatAddress } from '@/lib/address'
import CustomerEditor from './editor'

export const dynamic = 'force-dynamic'

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos').select('id, email, name, role, active').eq('id', user.id).maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const { data: customer } = await sb
    .from('customers')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Customer>()

  if (!customer) notFound()

  const { data: orders } = await sb
    .from('orders')
    .select('*')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<Order[]>()

  const ordersList = orders ?? []
  const relevantes = ordersList.filter(o => o.status !== 'cancelado')
  const totalFacturado = relevantes.reduce((acc, o) => acc + Number(o.total || 0), 0)
  const ticketPromedio = relevantes.length ? Math.round(totalFacturado / relevantes.length) : 0
  const ultimoPedido = ordersList[0]?.created_at ?? null
  const diasDesdeUltimo = ultimoPedido ? Math.floor((Date.now() - new Date(ultimoPedido).getTime()) / 86400000) : null

  // Frecuencia: días promedio entre pedidos (si hay >= 2 relevantes)
  let frecuenciaDias: number | null = null
  if (relevantes.length >= 2) {
    const sorted = [...relevantes].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const first = new Date(sorted[0].created_at).getTime()
    const last  = new Date(sorted[sorted.length - 1].created_at).getTime()
    frecuenciaDias = Math.round(((last - first) / 86400000) / (sorted.length - 1))
  }

  // Método de pago más frecuente
  const payCounts = new Map<string, number>()
  for (const o of ordersList) {
    if (o.payment_method) payCounts.set(o.payment_method, (payCounts.get(o.payment_method) ?? 0) + 1)
  }
  let metodoPreferido: string | null = null
  let maxN = 0
  for (const [m, n] of payCounts) if (n > maxN) { metodoPreferido = m; maxN = n }

  const isBlacklisted = customer.tags.includes('blacklist')
  const hasIncidents = ordersList.length > 0 && await (async () => {
    const { count } = await sb.from('order_incidents').select('id', { count: 'exact', head: true }).in('order_id', ordersList.map(o => o.id))
    return (count ?? 0) > 0
  })()

  let tipoCliente: 'NUEVO' | 'RECURRENTE' | 'VIP' | null = null
  if (relevantes.length >= 10) tipoCliente = 'VIP'
  else if (relevantes.length >= 2)  tipoCliente = 'RECURRENTE'
  else if (relevantes.length === 1) tipoCliente = 'NUEVO'

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/clientes" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
          ← Clientes
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>{customer.name || '(sin nombre)'}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {ordersList.length} pedido{ordersList.length === 1 ? '' : 's'} · total ${totalFacturado.toLocaleString('es-AR')}
          </div>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* BLACKLIST BANNER */}
        {isBlacklisted && (
          <section style={{ background: '#fbeaea', border: '2px solid #a33', borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 22 }}>⚠️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#a33', letterSpacing: '0.4px' }}>CLIENTE EN LISTA NEGRA</div>
              {customer.notes && (
                <div style={{ fontSize: 13, color: '#2a2a2a', marginTop: 4, whiteSpace: 'pre-wrap' }}>{customer.notes}</div>
              )}
            </div>
          </section>
        )}

        {/* KPIs del cliente */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: 'Pedidos totales', value: String(ordersList.length), fg: '#2a2a2a', bg: '#fff', border: '#ede9e4' },
            { label: 'Monto total',     value: `$${totalFacturado.toLocaleString('es-AR')}`, fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
            { label: 'Ticket promedio', value: `$${ticketPromedio.toLocaleString('es-AR')}`, fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
            { label: 'Último pedido',   value: diasDesdeUltimo === null ? '—' : diasDesdeUltimo === 0 ? 'hoy' : `hace ${diasDesdeUltimo}d`, fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
            { label: 'Frecuencia',      value: frecuenciaDias === null ? '—' : `cada ${frecuenciaDias}d`, fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
            { label: 'Pago preferido',  value: metodoPreferido ?? '—', fg: '#555', bg: '#f5f5f5', border: '#e2e2e2' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `0.5px solid ${k.border}`, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: k.fg, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.fg, letterSpacing: '-0.4px', marginTop: 2, wordBreak: 'break-word' }}>{k.value}</div>
            </div>
          ))}
        </section>

        {/* BADGES CATEGORÍA */}
        {(tipoCliente || hasIncidents) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tipoCliente === 'VIP' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '1.5px solid #edc989', padding: '4px 10px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>⭐ VIP</span>
            )}
            {tipoCliente === 'RECURRENTE' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '1.5px solid #d9d6ff', padding: '4px 10px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Recurrente</span>
            )}
            {tipoCliente === 'NUEVO' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '1.5px solid #8fd1a8', padding: '4px 10px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Nuevo</span>
            )}
            {hasIncidents && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a33', background: '#fbeaea', border: '1.5px solid #e0a8a8', padding: '4px 10px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Con incidencias</span>
            )}
          </div>
        )}

        {/* EDITOR DE DATOS + NOTAS + TAGS */}
        <CustomerEditor customer={customer} />

        {/* HISTORIAL DE PEDIDOS */}
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            HISTORIAL DE PEDIDOS
          </div>
          {ordersList.length === 0 ? (
            <div style={{ fontSize: 13, color: '#bbb' }}>Sin pedidos asociados todavía.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ordersList.map(o => {
                const sc = STATUS_COLORS[o.status]
                const tc = TIPO_ENVIO_COLORS[o.tipo_envio]
                return (
                  <Link key={o.id} href={`/pedidos/${o.id}`}
                    style={{ textDecoration: 'none', color: 'inherit',
                      background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12,
                      padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{formatOrderNumber(o)}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                          {TIPO_ENVIO_LABELS[o.tipo_envio]}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {new Date(o.woo_created_at || o.created_at).toLocaleString('es-AR')} · {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sc.fg, background: sc.bg, border: `0.5px solid ${sc.border}`, padding: '3px 8px', borderRadius: 999 }}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>${Number(o.total).toLocaleString('es-AR')}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
