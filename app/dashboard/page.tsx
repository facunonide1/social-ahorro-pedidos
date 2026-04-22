import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS, ORIGIN_LABELS } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserPedidos, ZonaReparto } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'
import DashboardControls from './controls'

export const dynamic = 'force-dynamic'

function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; scope?: string; zona?: string; tipo?: string }
}) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const q = (searchParams.q || '').trim()
  const scope = searchParams.scope === 'all' ? 'all' : 'today'
  const statusFilter = (searchParams.status as OrderStatus | undefined) || undefined
  const zonaFilter = (searchParams.zona || '').trim() || undefined
  const tipoFilter = (['express','programado','retiro'].includes(searchParams.tipo ?? '')
    ? searchParams.tipo
    : undefined) as TipoEnvio | undefined

  const { data: zonas } = await sb
    .from('zonas_reparto')
    .select('id, nombre, color, activa')
    .order('activa', { ascending: false })
    .order('nombre', { ascending: true })

  let query = sb
    .from('orders')
    .select('*')
    .order('woo_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (scope === 'today') query = query.gte('created_at', startOfTodayISO())
  if (statusFilter) query = query.eq('status', statusFilter)
  if (zonaFilter === 'sin_zona') query = query.is('zona_id', null)
  else if (zonaFilter) query = query.eq('zona_id', zonaFilter)
  if (tipoFilter) query = query.eq('tipo_envio', tipoFilter)
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

  const { data: orders, error } = await query

  const byStatus = new Map<OrderStatus, Order[]>()
  for (const s of STATUS_ORDER) byStatus.set(s, [])
  ;(orders ?? []).forEach(o => byStatus.get(o.status as OrderStatus)?.push(o as Order))

  const { count: totalToday } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfTodayISO())

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Social Ahorro · Pedidos</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {profile.name || profile.email} · <span style={{ textTransform: 'capitalize' }}>{profile.role}</span> · {totalToday ?? 0} hoy
            </div>
          </div>
        </div>
        <DashboardControls
          initialQ={q}
          initialStatus={statusFilter}
          initialScope={scope}
          initialZona={zonaFilter}
          initialTipo={tipoFilter}
          zonas={(zonas ?? []) as ZonaReparto[]}
          role={profile.role}
        />
      </header>

      {error && (
        <div style={{ margin: 24, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
          Error cargando pedidos: {error.message}
        </div>
      )}

      <main style={{ padding: '20px 24px', display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {STATUS_ORDER.map(status => {
          const list = byStatus.get(status) ?? []
          const c = STATUS_COLORS[status]
          if (statusFilter && status !== statusFilter) return null
          return (
            <section key={status} style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: c.fg }}>
                  {STATUS_LABELS[status]}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '3px 8px', borderRadius: 999 }}>
                  {list.length}
                </span>
              </div>

              {list.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '12px 2px' }}>—</div>
              ) : list.map(o => {
                const tc = TIPO_ENVIO_COLORS[o.tipo_envio]
                return (
                  <Link key={o.id} href={`/pedidos/${o.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ border: '0.5px solid #f0ede8', borderRadius: 12, padding: '10px 12px', background: '#faf8f5', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{formatOrderNumber(o)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a' }}>
                          ${Number(o.total).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                          {TIPO_ENVIO_LABELS[o.tipo_envio]}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#888', background: '#faf8f5', border: '0.5px solid #ede9e4', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                          {ORIGIN_LABELS[o.origin]}
                        </span>
                        {o.fuera_de_horario && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            Fuera de horario
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#2a2a2a' }}>{o.customer_name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {o.customer_phone || 's/tel'} · {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </section>
          )
        })}
      </main>
    </div>
  )
}
