import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS, ORIGIN_LABELS } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserPedidos, ZonaReparto } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'
import DashboardControls from './controls'
import DashboardSidebar from './sidebar'
import LiveClock from './live-clock'
import SyncButton from './sync-button'
import NewOrderNotifier from './new-order-notifier'

export const dynamic = 'force-dynamic'

function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

type Kpi = {
  label: string
  value: number
  fg: string
  bg: string
  border: string
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

  const todayISO = startOfTodayISO()

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

  if (scope === 'today') query = query.gte('created_at', todayISO)
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

  // KPIs del día en paralelo
  const [
    totalRes,
    pendientesRes,
    enCaminoRes,
    entregadosRes,
    fueraHorarioRes,
    ordersRes,
  ] = await Promise.all([
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).in('status', ['nuevo','confirmado','en_preparacion','listo']),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('status', 'en_camino'),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('status', 'entregado'),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('fuera_de_horario', true).not('status', 'in', '(entregado,cancelado)'),
    query,
  ])

  const orders = ordersRes.data
  const error  = ordersRes.error

  const byStatus = new Map<OrderStatus, Order[]>()
  for (const s of STATUS_ORDER) byStatus.set(s, [])
  ;(orders ?? []).forEach(o => byStatus.get(o.status as OrderStatus)?.push(o as Order))

  const kpis: Kpi[] = [
    { label: 'Total hoy',        value: totalRes.count        ?? 0, fg: '#2a2a2a', bg: '#fff',    border: '#ede9e4' },
    { label: 'Pendientes',       value: pendientesRes.count   ?? 0, fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
    { label: 'En camino',        value: enCaminoRes.count     ?? 0, fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
    { label: 'Entregados',       value: entregadosRes.count   ?? 0, fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
    { label: 'Fuera de horario', value: fueraHorarioRes.count ?? 0, fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex', alignItems: 'stretch' }}>
      <DashboardSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <LiveClock />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <NewOrderNotifier />
            <Link href="/pedidos/nuevo"
              style={{ padding: '9px 13px', border: 'none', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Nuevo pedido
            </Link>
            <SyncButton />
          </div>
        </header>

        {error && (
          <div style={{ margin: 24, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
            Error cargando pedidos: {error.message}
          </div>
        )}

        {/* KPIs */}
        <section style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {kpis.map(k => (
            <div key={k.label} style={{
              background: k.bg, border: `0.5px solid ${k.border}`, borderRadius: 14,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: k.fg, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: k.fg, letterSpacing: '-0.5px' }}>
                {k.value}
              </div>
            </div>
          ))}
        </section>

        {/* FILTROS */}
        <section style={{ padding: '16px 24px 0' }}>
          <DashboardControls
            initialQ={q}
            initialStatus={statusFilter}
            initialScope={scope}
            initialZona={zonaFilter}
            initialTipo={tipoFilter}
            zonas={(zonas ?? []) as ZonaReparto[]}
          />
        </section>

        {/* KANBAN */}
        <main style={{ padding: '16px 24px 24px', display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {STATUS_ORDER.map(status => {
            const list = byStatus.get(status) ?? []
            const c = STATUS_COLORS[status]
            if (statusFilter && status !== statusFilter) return null
            return (
              <section key={status} style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: c.fg }}>
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
                          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.2px' }}>{formatOrderNumber(o)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a' }}>
                            ${Number(o.total).toLocaleString('es-AR')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            {TIPO_ENVIO_LABELS[o.tipo_envio]}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#888', background: '#fff', border: '0.5px solid #ede9e4', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
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
    </div>
  )
}
