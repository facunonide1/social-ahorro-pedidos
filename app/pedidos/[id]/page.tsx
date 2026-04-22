import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_COLORS, STATUS_ORDER, ORIGIN_LABELS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS } from '@/lib/types'
import type { Order, OrderStatus, UserPedidos, OrderStatusHistory, ZonaReparto } from '@/lib/types'
import { formatAddress, googleMapsLink } from '@/lib/address'
import { formatOrderNumber } from '@/lib/orders/format'
import { minutesBetween, formatDuration } from '@/lib/orders/timing'
import OrderActions from './actions'
import WooSyncBanner from './woo-sync-banner'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')

  const { data: order } = await sb
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Order>()

  if (!order) notFound()

  const { data: history } = await sb
    .from('order_status_history')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })

  const { data: repartidores } = profile.role === 'admin' || profile.role === 'operador'
    ? await sb.from('users_pedidos').select('id, name, email, role, active').eq('role', 'repartidor').eq('active', true)
    : { data: [] as Pick<UserPedidos,'id'|'name'|'email'|'role'|'active'>[] }

  const { data: zonas } = profile.role === 'admin' || profile.role === 'operador'
    ? await sb.from('zonas_reparto').select('id, nombre, color, activa').order('activa', { ascending: false }).order('nombre', { ascending: true })
    : { data: [] as Pick<ZonaReparto,'id'|'nombre'|'color'|'activa'>[] }

  const { data: changers } = await sb
    .from('users_pedidos')
    .select('id, name, email')
    .in('id', Array.from(new Set((history ?? []).map(h => h.changed_by).filter(Boolean))) as string[])

  const changerMap = new Map((changers ?? []).map(c => [c.id, c.name || c.email]))

  const c = STATUS_COLORS[order.status]
  const shipping = order.shipping_address
  const mapsLink = googleMapsLink(shipping)
  const addressStr = formatAddress(shipping) || formatAddress(order.billing_address)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href={profile.role === 'repartidor' ? '/repartidor' : '/dashboard'} style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>← Volver</Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Pedido {formatOrderNumber(order)}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {ORIGIN_LABELS[order.origin]} · {order.woo_created_at ? new Date(order.woo_created_at).toLocaleString('es-AR') : new Date(order.created_at).toLocaleString('es-AR')}
          </div>
        </div>
        {(() => {
          const tc = TIPO_ENVIO_COLORS[order.tipo_envio]
          return (
            <span style={{ fontSize: 11, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '4px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {TIPO_ENVIO_LABELS[order.tipo_envio]}
            </span>
          )
        })()}
        {order.fuera_de_horario && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '4px 9px', borderRadius: 999 }}>
            Fuera de horario
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '5px 10px', borderRadius: 999 }}>
          {STATUS_LABELS[order.status]}
        </span>
      </header>

      <main style={{ padding: 20, display: 'grid', gap: 16, maxWidth: 900, margin: '0 auto' }}>
        <WooSyncBanner order={order} />

        {/* CLIENTE + DIRECCION */}
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CLIENTE</div>
            {order.customer_id && (
              <Link href={`/clientes/${order.customer_id}`}
                style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                Ver ficha →
              </Link>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{order.customer_name || '—'}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {order.customer_phone || 'Sin teléfono'} {order.customer_email ? `· ${order.customer_email}` : ''}
          </div>
          {order.customer_dni && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              DNI {order.customer_dni}
            </div>
          )}
          {addressStr && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 4 }}>DIRECCIÓN</div>
              <div style={{ fontSize: 13, color: '#2a2a2a' }}>{addressStr}</div>
              {mapsLink && (
                <a href={mapsLink} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                  Abrir en Google Maps ↗
                </a>
              )}
            </div>
          )}
          {order.notes && (
            <div style={{ marginTop: 12, padding: 10, background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', letterSpacing: '0.4px', marginBottom: 4 }}>NOTA DEL CLIENTE</div>
              <div style={{ fontSize: 13, color: '#2a2a2a' }}>{order.notes}</div>
            </div>
          )}
        </section>

        {/* ITEMS */}
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>ITEMS ({order.items.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {order.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: i < order.items.length - 1 ? '0.5px solid #f0ede8' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{it.name}</div>
                  {it.sku && <div style={{ fontSize: 11, color: '#aaa' }}>SKU: {it.sku}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>×{it.qty}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>${Number(it.price).toLocaleString('es-AR')}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #f0ede8' }}>
            <div style={{ fontSize: 12, color: '#888' }}>{order.payment_method || 'Pago no especificado'}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>${Number(order.total).toLocaleString('es-AR')}</div>
          </div>
        </section>

        {/* ACCIONES */}
        <OrderActions order={order} role={profile.role} repartidores={repartidores ?? []} zonas={(zonas ?? []) as ZonaReparto[]} />

        {/* HITOS / TIEMPOS */}
        {(() => {
          const entrada = order.woo_created_at || order.created_at
          const hitos: Array<{ label: string; ts: string | null; prev: string | null }> = [
            { label: 'Entró',         ts: entrada,              prev: null             },
            { label: 'Confirmado',    ts: order.confirmed_at,   prev: entrada          },
            { label: 'Listo',         ts: order.ready_at,       prev: order.confirmed_at ?? entrada },
            { label: 'Entregado',     ts: order.delivered_at,   prev: order.ready_at ?? order.confirmed_at ?? entrada },
          ]
          const totalMin = minutesBetween(entrada, order.delivered_at)
          return (
            <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>TIEMPOS</div>
                {totalMin !== null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '3px 8px', borderRadius: 999 }}>
                    Total: {formatDuration(totalMin)}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 14px', fontSize: 13 }}>
                {hitos.map((h, i) => {
                  const delta = minutesBetween(h.prev, h.ts)
                  return (
                    <div key={h.label} style={{ display: 'contents' }}>
                      <div style={{ color: '#888', fontWeight: 600 }}>{h.label}</div>
                      <div style={{ color: h.ts ? '#2a2a2a' : '#bbb' }}>
                        {h.ts ? new Date(h.ts).toLocaleString('es-AR') : 'pendiente'}
                      </div>
                      <div style={{ color: '#aaa', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {i > 0 && delta !== null ? `+${formatDuration(delta)}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })()}

        {/* HISTORIAL */}
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>HISTORIAL</div>
          {(history ?? []).length === 0 ? (
            <div style={{ fontSize: 13, color: '#bbb' }}>Sin movimientos</div>
          ) : (history ?? []).map((h: OrderStatusHistory, i) => {
            const hc = STATUS_COLORS[h.status]
            return (
              <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: i < (history?.length ?? 0) - 1 ? '0.5px solid #f0ede8' : 'none' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: hc.fg, marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: hc.fg }}>{STATUS_LABELS[h.status]}</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    {new Date(h.created_at).toLocaleString('es-AR')}
                    {h.changed_by && changerMap.has(h.changed_by) && ` · ${changerMap.get(h.changed_by)}`}
                  </div>
                  {h.note && (
                    <div style={{ fontSize: 13, color: '#2a2a2a', marginTop: 6, padding: 8, background: '#faf8f5', borderRadius: 8 }}>
                      {h.note}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}
