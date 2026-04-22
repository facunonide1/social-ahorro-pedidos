import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS, ORIGIN_LABELS } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserPedidos, ZonaReparto } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'
import { relativeFrom, SEVERITY_COLORS } from '@/lib/orders/timing'
import DashboardControls from './controls'
import DashboardSidebar from './sidebar'
import LiveClock from './live-clock'
import SyncButton from './sync-button'
import NewOrderNotifier from './new-order-notifier'
import TitleBadge from './title-badge'

export const dynamic = 'force-dynamic'

const PENDIENTES_STATUSES: OrderStatus[] = ['nuevo','confirmado','en_preparacion','listo']

function startOfDayISO(date = new Date()) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function endOfDayISO(date = new Date()) {
  const d = new Date(date); d.setHours(23, 59, 59, 999); return d.toISOString()
}

type Kpi = {
  label: string
  value: number
  fg: string
  bg: string
  border: string
  href: string
  active: boolean
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    status?: string     // individual OR 'pendientes'
    scope?: string      // 'today' | 'all'
    zona?: string
    tipo?: string
    rep?: string        // assigned_to uuid
    date?: string       // YYYY-MM-DD
    fuera?: string      // '1' → solo fuera_de_horario activos
    view?: string       // 'kanban' | 'lista'
  }
}) {
  const viewMode = searchParams.view === 'lista' ? 'lista' : 'kanban'
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
  const statusRaw = (searchParams.status ?? '').trim()
  const isPendientesFilter = statusRaw === 'pendientes'
  const statusFilter: OrderStatus | undefined = !isPendientesFilter && statusRaw
    ? (statusRaw as OrderStatus)
    : undefined
  const zonaFilter = (searchParams.zona || '').trim() || undefined
  const tipoFilter = (['express','programado','retiro'].includes(searchParams.tipo ?? '')
    ? searchParams.tipo
    : undefined) as TipoEnvio | undefined
  const repFilter = (searchParams.rep || '').trim() || undefined
  const fueraFilter = searchParams.fuera === '1'

  // Fecha: si viene date, la usamos como "el día de esa fecha".
  // Si no viene, scope controla (today por default, all = ignora fecha).
  const dateStr = (searchParams.date || '').trim()
  const scope  = searchParams.scope === 'all' ? 'all' : 'today'
  const useDate = !!dateStr
  const fromISO = useDate ? startOfDayISO(new Date(dateStr + 'T00:00:00')) :
                   scope === 'today' ? startOfDayISO() : null
  const toISO   = useDate ? endOfDayISO(new Date(dateStr + 'T00:00:00')) : null

  const todayISO = startOfDayISO()

  // Zonas y repartidores para los filtros
  const [zonasRes, repsRes] = await Promise.all([
    sb.from('zonas_reparto').select('id, nombre, color, activa').order('activa', { ascending: false }).order('nombre', { ascending: true }),
    sb.from('users_pedidos').select('id, name, email').eq('role', 'repartidor').eq('active', true).order('name', { ascending: true }),
  ])

  // Query principal del listado
  let query = sb
    .from('orders')
    .select('*')
    .order('woo_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (fromISO) query = query.gte('created_at', fromISO)
  if (toISO)   query = query.lte('created_at', toISO)
  if (isPendientesFilter) query = query.in('status', PENDIENTES_STATUSES)
  else if (statusFilter)  query = query.eq('status', statusFilter)
  if (zonaFilter === 'sin_zona') query = query.is('zona_id', null)
  else if (zonaFilter) query = query.eq('zona_id', zonaFilter)
  if (tipoFilter) query = query.eq('tipo_envio', tipoFilter)
  if (repFilter === 'sin_asignar') query = query.is('assigned_to', null)
  else if (repFilter) query = query.eq('assigned_to', repFilter)
  if (fueraFilter) {
    query = query.eq('fuera_de_horario', true).not('status', 'in', '(entregado,cancelado)')
  }
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

  // KPIs del día (siempre sobre HOY, no la fecha seleccionada, para que el
  // operador vea a golpe de vista cómo va la jornada actual)
  const [
    totalRes,
    pendientesRes,
    enCaminoRes,
    entregadosRes,
    canceladosRes,
    fueraHorarioRes,
    ordersRes,
  ] = await Promise.all([
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).in('status', PENDIENTES_STATUSES),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('status', 'en_camino'),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('status', 'entregado'),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('status', 'cancelado'),
    sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('fuera_de_horario', true).not('status', 'in', '(entregado,cancelado)'),
    query,
  ])

  const orders = ordersRes.data
  const error  = ordersRes.error

  // Map de counts por customer para el badge NUEVO/RECURRENTE
  const customerIds = Array.from(new Set((orders ?? []).map(o => o.customer_id).filter(Boolean))) as string[]
  const customerOrdersCount = new Map<string, number>()
  if (customerIds.length > 0) {
    const { data: summaries } = await sb
      .from('customers')
      .select('id, orders:orders(count)')
      .in('id', customerIds)
    for (const c of (summaries ?? []) as any[]) {
      const n = Array.isArray(c.orders) ? (c.orders[0]?.count ?? 0) : 0
      customerOrdersCount.set(c.id, n)
    }
  }

  // IDs de orders con alguna incidencia para pintar badge INCIDENCIA
  const orderIds = (orders ?? []).map(o => o.id)
  const incidentOrderIds = new Set<string>()
  if (orderIds.length > 0) {
    const { data: incs } = await sb
      .from('order_incidents')
      .select('order_id')
      .in('order_id', orderIds)
    for (const r of incs ?? []) incidentOrderIds.add(r.order_id as string)
  }

  const byStatus = new Map<OrderStatus, Order[]>()
  for (const s of STATUS_ORDER) byStatus.set(s, [])
  ;(orders ?? []).forEach(o => byStatus.get(o.status as OrderStatus)?.push(o as Order))

  // Construcción de KPIs (clickeables como filtros)
  function makeHref(next: { status?: string; fuera?: '1'; view?: string }) {
    const p = new URLSearchParams()
    if (next.status)       p.set('status', next.status)
    if (next.fuera === '1') p.set('fuera', '1')
    if (tipoFilter) p.set('tipo', tipoFilter)
    if (zonaFilter) p.set('zona', zonaFilter)
    if (repFilter)  p.set('rep',  repFilter)
    if (q)          p.set('q',    q)
    const v = next.view ?? (viewMode === 'lista' ? 'lista' : '')
    if (v && v !== 'kanban') p.set('view', v)
    return `/dashboard${p.toString() ? '?' + p : ''}`
  }

  const kpis: Kpi[] = [
    { label: 'Total hoy',   value: totalRes.count        ?? 0, fg: '#2a2a2a', bg: '#fff',    border: '#ede9e4',
      href: '/dashboard', active: !statusRaw && !fueraFilter },
    { label: 'Pendientes',  value: pendientesRes.count   ?? 0, fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff',
      href: makeHref({ status: 'pendientes' }), active: isPendientesFilter },
    { label: 'En camino',   value: enCaminoRes.count     ?? 0, fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee',
      href: makeHref({ status: 'en_camino' }),  active: statusFilter === 'en_camino' },
    { label: 'Entregados',  value: entregadosRes.count   ?? 0, fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8',
      href: makeHref({ status: 'entregado' }),  active: statusFilter === 'entregado' },
    { label: 'Cancelados',  value: canceladosRes.count   ?? 0, fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8',
      href: makeHref({ status: 'cancelado' }),  active: statusFilter === 'cancelado' },
    { label: 'Fuera de horario', value: fueraHorarioRes.count ?? 0, fg: '#c6831a', bg: '#fff7ec', border: '#edc989',
      href: makeHref({ fuera: '1' }),           active: fueraFilter },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex', alignItems: 'stretch' }}>
      <TitleBadge pendientes={pendientesRes.count ?? 0} />
      <DashboardSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <LiveClock />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <NewOrderNotifier />
            <a href={`/api/orders/export?${new URLSearchParams(Object.entries(searchParams).filter(([,v]) => v) as [string,string][]).toString()}`}
              title="Exportar los pedidos del filtro actual a CSV"
              style={{ padding: '9px 13px', border: '1.5px solid #f0ede8', borderRadius: 10, background: '#fff', color: '#555', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              ⬇ CSV
            </a>
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

        {/* KPIs clickeables */}
        <section style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {kpis.map(k => (
            <Link key={k.label} href={k.href} scroll={false}
              style={{
                textDecoration: 'none',
                background: k.bg,
                border: `${k.active ? '2px' : '0.5px'} solid ${k.active ? k.fg : k.border}`,
                borderRadius: 14, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 2,
                transition: 'transform 0.1s',
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: k.fg, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: k.fg, letterSpacing: '-0.5px' }}>
                {k.value}
              </div>
            </Link>
          ))}
        </section>

        {/* TOGGLE KANBAN / LISTA */}
        <div style={{ padding: '16px 24px 0', display: 'flex', gap: 6 }}>
          {([['kanban','Kanban'], ['lista','Lista']] as const).map(([key, label]) => {
            const active = viewMode === key
            const p = new URLSearchParams()
            if (key !== 'kanban') p.set('view', 'lista')
            if (statusRaw) p.set('status', statusRaw)
            if (fueraFilter) p.set('fuera', '1')
            if (tipoFilter) p.set('tipo', tipoFilter)
            if (zonaFilter) p.set('zona', zonaFilter)
            if (repFilter)  p.set('rep',  repFilter)
            if (q)          p.set('q',    q)
            if (dateStr)    p.set('date', dateStr)
            const href = `/dashboard${p.toString() ? '?' + p : ''}`
            return (
              <Link key={key} href={href}
                style={{
                  padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  textDecoration: 'none', letterSpacing: '-0.2px',
                  background: active ? '#2a2a2a' : '#fff',
                  color:      active ? '#fff'    : '#666',
                  border:     active ? '1.5px solid #2a2a2a' : '1.5px solid #f0ede8',
                }}>
                {label}
              </Link>
            )
          })}
        </div>

        {/* FILTROS */}
        <section style={{ padding: '16px 24px 0' }}>
          <DashboardControls
            initialQ={q}
            initialStatus={isPendientesFilter ? undefined : statusFilter}
            initialScope={scope}
            initialZona={zonaFilter}
            initialTipo={tipoFilter}
            initialRep={repFilter}
            initialDate={dateStr}
            zonas={(zonasRes.data ?? []) as ZonaReparto[]}
            repartidores={(repsRes.data ?? [])}
          />
        </section>

        {/* LISTA */}
        {viewMode === 'lista' && (
          <main style={{ padding: '16px 24px 24px' }}>
            <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf8f5', borderBottom: '0.5px solid #ede9e4' }}>
                    {['Código','Cliente','Teléfono','Tipo','Estado','Zona','Repartidor','Total','Desde hace',''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(orders ?? []).length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>Sin pedidos para los filtros aplicados.</td></tr>
                  )}
                  {(orders ?? []).map(o => {
                    const sc = STATUS_COLORS[o.status as OrderStatus]
                    const tc = TIPO_ENVIO_COLORS[o.tipo_envio]
                    const t = relativeFrom(o.woo_created_at || o.created_at, o.status as OrderStatus)
                    const tsc = SEVERITY_COLORS[t.severity]
                    const zonaObj = (zonasRes.data ?? []).find(z => z.id === o.zona_id)
                    const repObj  = (repsRes.data ?? []).find(r => r.id === o.assigned_to)
                    const isExpressActive = o.tipo_envio === 'express' && o.status !== 'entregado' && o.status !== 'cancelado'
                    return (
                      <tr key={o.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{formatOrderNumber(o)}</td>
                        <td style={{ padding: '10px 12px' }}>{o.customer_name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#666' }}>{o.customer_phone || 's/tel'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={isExpressActive ? 'sa-express-pulse' : ''}
                            style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            {TIPO_ENVIO_LABELS[o.tipo_envio]}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sc.fg, background: sc.bg, border: `0.5px solid ${sc.border}`, padding: '3px 8px', borderRadius: 999 }}>
                            {STATUS_LABELS[o.status as OrderStatus]}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#666' }}>{zonaObj?.nombre || '—'}</td>
                        <td style={{ padding: '10px 12px', color: o.assigned_to ? '#2a2a2a' : '#a33' }}>
                          {repObj ? (repObj.name || repObj.email) : (o.tipo_envio === 'retiro' ? '—' : 'Sin asignar')}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>${Number(o.total).toLocaleString('es-AR')}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: tsc.fg, background: tsc.bg, border: `0.5px solid ${tsc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px' }}>
                            {t.text}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Link href={`/pedidos/${o.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </main>
        )}

        {/* KANBAN */}
        {viewMode === 'kanban' && (
        <main style={{ padding: '16px 24px 24px', display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {STATUS_ORDER.map(status => {
            const list = byStatus.get(status) ?? []
            const c = STATUS_COLORS[status]
            // Si el filtro es un estado individual, mostramos sólo esa columna
            if (statusFilter && status !== statusFilter) return null
            // Si el filtro es "pendientes" mostramos sólo los pendientes
            if (isPendientesFilter && !PENDIENTES_STATUSES.includes(status)) return null
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
                  const isExpressActive = o.tipo_envio === 'express' && o.status !== 'entregado' && o.status !== 'cancelado'
                  const customerCount = o.customer_id ? customerOrdersCount.get(o.customer_id) ?? 0 : 0
                  const isNewCustomer  = customerCount === 1
                  const isReturning    = customerCount >= 2
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
                          <span
                            className={isExpressActive ? 'sa-express-pulse' : ''}
                            style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            {TIPO_ENVIO_LABELS[o.tipo_envio]}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#888', background: '#fff', border: '0.5px solid #ede9e4', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            {ORIGIN_LABELS[o.origin]}
                          </span>
                          {isNewCustomer && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                              Nuevo
                            </span>
                          )}
                          {isReturning && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '0.5px solid #d9d6ff', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                              {customerCount} pedidos
                            </span>
                          )}
                          {o.fuera_de_horario && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                              Fuera de horario
                            </span>
                          )}
                          {!o.assigned_to && o.status !== 'entregado' && o.status !== 'cancelado' && o.tipo_envio !== 'retiro' && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#a33', background: '#fbeaea', border: '0.5px solid #e0a8a8', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                              Sin repartidor
                            </span>
                          )}
                          {incidentOrderIds.has(o.id) && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#a33', border: '0.5px solid #a33', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                              Incidencia
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#2a2a2a' }}>{o.customer_name || '—'}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#999' }}>
                            {o.customer_phone || 's/tel'} · {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'}
                          </span>
                          {(() => {
                            const t = relativeFrom(o.woo_created_at || o.created_at, o.status)
                            const sc = SEVERITY_COLORS[t.severity]
                            return (
                              <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, border: `0.5px solid ${sc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                                {t.text}
                              </span>
                            )
                          })()}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </section>
            )
          })}
        </main>
        )}
      </div>

      {/* Keyframes globales para el badge Express parpadeante */}
      <style>{`
        @keyframes sa-express-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,109,110,0.6); opacity: 1; }
          50%      { box-shadow: 0 0 0 4px rgba(255,109,110,0.0); opacity: 0.7; }
        }
        .sa-express-pulse { animation: sa-express-pulse 1.3s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
