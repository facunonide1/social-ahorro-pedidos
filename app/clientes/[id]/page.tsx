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
  const totalFacturado = ordersList
    .filter(o => o.status !== 'cancelado')
    .reduce((acc, o) => acc + Number(o.total || 0), 0)

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
