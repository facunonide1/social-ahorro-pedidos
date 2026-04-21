import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/types'
import type { Order, UserPedidos } from '@/lib/types'
import { formatAddress, googleMapsLink } from '@/lib/address'
import RepartidorRowActions from './row-actions'

export const dynamic = 'force-dynamic'

export default async function RepartidorPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role !== 'repartidor') redirect('/dashboard')

  // Traigo TODAS las entregas asignadas al repartidor (incluye atrasadas)
  // y separo en pendientes vs cerrados en memoria, con orden lógico.
  const { data: orders } = await sb
    .from('orders')
    .select('*')
    .eq('assigned_to', profile.id)
    .order('created_at', { ascending: false })
    .returns<Order[]>()

  const prioridad: Record<string, number> = {
    en_camino: 0, listo: 1, en_preparacion: 2, confirmado: 3, nuevo: 4,
    entregado: 5, cancelado: 6,
  }
  const sorted = (orders ?? []).slice().sort(
    (a, b) => (prioridad[a.status] ?? 99) - (prioridad[b.status] ?? 99)
  )

  const pendientes = sorted.filter(o => o.status !== 'entregado' && o.status !== 'cancelado')
  const cerrados   = sorted.filter(o => o.status === 'entregado' || o.status === 'cancelado')

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 18px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Mis entregas</div>
          <div style={{ fontSize: 12, color: '#999' }}>{profile.name || profile.email} · {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</div>
        </div>
        <form action="/logout" method="post">
          <button type="submit" style={{ padding: '8px 12px', border: '1.5px solid #f0ede8', borderRadius: 10, background: '#fff', color: '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </form>
      </header>

      <main style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640, margin: '0 auto' }}>
        {pendientes.length === 0 && cerrados.length === 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 24, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
            No tenés entregas asignadas.
          </div>
        )}

        {pendientes.map(o => <DeliveryCard key={o.id} order={o} />)}

        {cerrados.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', padding: '8px 4px' }}>CERRADOS</div>
            {cerrados.map(o => <DeliveryCard key={o.id} order={o} compact />)}
          </div>
        )}
      </main>
    </div>
  )
}

function DeliveryCard({ order, compact }: { order: Order; compact?: boolean }) {
  const c = STATUS_COLORS[order.status]
  const addr = formatAddress(order.shipping_address) || formatAddress(order.billing_address)
  const maps = googleMapsLink(order.shipping_address) || googleMapsLink(order.billing_address)

  return (
    <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 14, opacity: compact ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{order.customer_name || '—'}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>#{order.woo_order_id} · ${Number(order.total).toLocaleString('es-AR')}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '4px 9px', borderRadius: 999 }}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      {addr && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#2a2a2a', lineHeight: 1.4 }}>
          📍 {addr}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer"
            style={{ flex: '1 1 120px', textAlign: 'center', padding: '12px 14px', borderRadius: 12, background: '#726DFF', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Google Maps
          </a>
        )}
        {order.customer_phone && (
          <a href={`tel:${order.customer_phone}`}
            style={{ flex: '1 1 120px', textAlign: 'center', padding: '12px 14px', borderRadius: 12, background: '#f0ede8', color: '#2a2a2a', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Llamar
          </a>
        )}
        <Link href={`/pedidos/${order.id}`}
          style={{ flex: '1 1 120px', textAlign: 'center', padding: '12px 14px', borderRadius: 12, background: '#fff', color: '#726DFF', fontSize: 13, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #726DFF' }}>
          Ver detalle
        </Link>
      </div>

      {!compact && (
        <div style={{ marginTop: 10 }}>
          <RepartidorRowActions order={order} />
        </div>
      )}
    </div>
  )
}
