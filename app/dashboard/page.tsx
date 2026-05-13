import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Download, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserPedidos, ZonaReparto } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'

import { CrmShell } from '@/components/crm/crm-shell'
import { OrderCard } from '@/components/crm/order-card'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { OrderTimeBadge } from '@/components/crm/order-time-badge'
import { KpiCard } from '@/components/cards/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { PageActions } from '@/components/shared/page-actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import DashboardControls from './controls'
import LiveClock from './live-clock'
import SyncButton from './sync-button'
import NewOrderNotifier from './new-order-notifier'
import TitleBadge from './title-badge'
import GlobalSearch from './global-search'

export const dynamic = 'force-dynamic'

const PENDIENTES_STATUSES: OrderStatus[] = ['nuevo', 'confirmado', 'en_preparacion', 'listo']

function startOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function endOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    status?: string
    scope?: string
    zona?: string
    tipo?: string
    rep?: string
    date?: string
    fuera?: string
    view?: string
  }
}) {
  const viewMode = searchParams.view === 'lista' ? 'lista' : 'kanban'
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
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
  const statusFilter: OrderStatus | undefined =
    !isPendientesFilter && statusRaw ? (statusRaw as OrderStatus) : undefined
  const zonaFilter = (searchParams.zona || '').trim() || undefined
  const tipoFilter = (
    ['express', 'programado', 'retiro'].includes(searchParams.tipo ?? '')
      ? searchParams.tipo
      : undefined
  ) as TipoEnvio | undefined
  const repFilter = (searchParams.rep || '').trim() || undefined
  const fueraFilter = searchParams.fuera === '1'

  const dateStr = (searchParams.date || '').trim()
  const scope = searchParams.scope === 'all' ? 'all' : 'today'
  const useDate = !!dateStr
  const fromISO = useDate
    ? startOfDayISO(new Date(dateStr + 'T00:00:00'))
    : scope === 'today'
      ? startOfDayISO()
      : null
  const toISO = useDate ? endOfDayISO(new Date(dateStr + 'T00:00:00')) : null

  const todayISO = startOfDayISO()

  const [zonasRes, repsRes] = await Promise.all([
    sb
      .from('zonas_reparto')
      .select('id, nombre, color, activa')
      .order('activa', { ascending: false })
      .order('nombre', { ascending: true }),
    sb
      .from('users_pedidos')
      .select('id, name, email')
      .eq('role', 'repartidor')
      .eq('active', true)
      .order('name', { ascending: true }),
  ])

  let query = sb
    .from('orders')
    .select('*')
    .order('woo_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (fromISO) query = query.gte('created_at', fromISO)
  if (toISO) query = query.lte('created_at', toISO)
  if (isPendientesFilter) query = query.in('status', PENDIENTES_STATUSES)
  else if (statusFilter) query = query.eq('status', statusFilter)
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
    sb
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .in('status', PENDIENTES_STATUSES),
    sb
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('status', 'en_camino'),
    sb
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('status', 'entregado'),
    sb
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('status', 'cancelado'),
    sb
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('fuera_de_horario', true)
      .not('status', 'in', '(entregado,cancelado)'),
    query,
  ])

  const orders = ordersRes.data
  const error = ordersRes.error

  const customerIds = Array.from(
    new Set((orders ?? []).map((o) => o.customer_id).filter(Boolean)),
  ) as string[]
  const customerOrdersCount = new Map<string, number>()
  if (customerIds.length > 0) {
    const { data: summaries } = await sb
      .from('customers')
      .select('id, orders:orders(count)')
      .in('id', customerIds)
    for (const c of (summaries ?? []) as Array<{ id: string; orders?: Array<{ count: number }> }>) {
      const n = Array.isArray(c.orders) ? c.orders[0]?.count ?? 0 : 0
      customerOrdersCount.set(c.id, n)
    }
  }

  const orderIds = (orders ?? []).map((o) => o.id)
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
  ;(orders ?? []).forEach((o) => byStatus.get(o.status as OrderStatus)?.push(o as Order))

  function makeHref(next: { status?: string; fuera?: '1'; view?: string }) {
    const p = new URLSearchParams()
    if (next.status) p.set('status', next.status)
    if (next.fuera === '1') p.set('fuera', '1')
    if (tipoFilter) p.set('tipo', tipoFilter)
    if (zonaFilter) p.set('zona', zonaFilter)
    if (repFilter) p.set('rep', repFilter)
    if (q) p.set('q', q)
    const v = next.view ?? (viewMode === 'lista' ? 'lista' : '')
    if (v && v !== 'kanban') p.set('view', v)
    return `/dashboard${p.toString() ? '?' + p : ''}`
  }

  const exportHref = `/api/orders/export?${new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString()}`

  const viewHref = (v: 'kanban' | 'lista') => {
    const p = new URLSearchParams()
    if (v === 'lista') p.set('view', 'lista')
    if (statusRaw) p.set('status', statusRaw)
    if (fueraFilter) p.set('fuera', '1')
    if (tipoFilter) p.set('tipo', tipoFilter)
    if (zonaFilter) p.set('zona', zonaFilter)
    if (repFilter) p.set('rep', repFilter)
    if (q) p.set('q', q)
    if (dateStr) p.set('date', dateStr)
    return `/dashboard${p.toString() ? '?' + p : ''}`
  }

  return (
    <CrmShell>
      <TitleBadge pendientes={pendientesRes.count ?? 0} />
      <PageHeader
        title="Dashboard"
        description={<LiveClock />}
        actions={
          <PageActions>
            <GlobalSearch />
            <NewOrderNotifier />
            <Button asChild variant="outline" size="sm">
              <a href={exportHref} title="Exportar pedidos del filtro a CSV">
                <Download className="size-4" />
                CSV
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/pedidos/nuevo">
                <Plus className="size-4" />
                Nuevo pedido
              </Link>
            </Button>
            <SyncButton />
          </PageActions>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Error cargando pedidos: {error.message}</AlertDescription>
          </Alert>
        )}

        {/* KPIs clickeables */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Total hoy"
            value={totalRes.count ?? 0}
            href="/dashboard"
            variant={!statusRaw && !fueraFilter ? 'default' : 'default'}
          />
          <KpiCard
            label="Pendientes"
            value={pendientesRes.count ?? 0}
            href={makeHref({ status: 'pendientes' })}
            variant={isPendientesFilter ? 'warning' : 'default'}
          />
          <KpiCard
            label="En camino"
            value={enCaminoRes.count ?? 0}
            href={makeHref({ status: 'en_camino' })}
            variant={statusFilter === 'en_camino' ? 'warning' : 'default'}
          />
          <KpiCard
            label="Entregados"
            value={entregadosRes.count ?? 0}
            href={makeHref({ status: 'entregado' })}
            variant={statusFilter === 'entregado' ? 'success' : 'default'}
          />
          <KpiCard
            label="Cancelados"
            value={canceladosRes.count ?? 0}
            href={makeHref({ status: 'cancelado' })}
            variant={statusFilter === 'cancelado' ? 'danger' : 'default'}
          />
          <KpiCard
            label="Fuera de horario"
            value={fueraHorarioRes.count ?? 0}
            href={makeHref({ fuera: '1' })}
            variant={fueraFilter ? 'danger' : 'default'}
          />
        </section>

        {/* Tabs vista */}
        <Tabs value={viewMode}>
          <TabsList>
            <TabsTrigger value="kanban" asChild>
              <Link href={viewHref('kanban')}>Kanban</Link>
            </TabsTrigger>
            <TabsTrigger value="lista" asChild>
              <Link href={viewHref('lista')}>Lista</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filtros */}
        <DashboardControls
          initialQ={q}
          initialStatus={isPendientesFilter ? undefined : statusFilter}
          initialScope={scope}
          initialZona={zonaFilter}
          initialTipo={tipoFilter}
          initialRep={repFilter}
          initialDate={dateStr}
          zonas={(zonasRes.data ?? []) as ZonaReparto[]}
          repartidores={repsRes.data ?? []}
        />

        {/* Vista lista */}
        {viewMode === 'lista' && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden lg:table-cell">Zona</TableHead>
                      <TableHead className="hidden lg:table-cell">Repartidor</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="hidden md:table-cell">Desde hace</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(orders ?? []).length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          Sin pedidos para los filtros aplicados.
                        </TableCell>
                      </TableRow>
                    )}
                    {(orders ?? []).map((o) => {
                      const zonaObj = (zonasRes.data ?? []).find((z) => z.id === o.zona_id)
                      const repObj = (repsRes.data ?? []).find((r) => r.id === o.assigned_to)
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-bold">{formatOrderNumber(o)}</TableCell>
                          <TableCell>{o.customer_name || '—'}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {o.customer_phone || 's/tel'}
                          </TableCell>
                          <TableCell>
                            <OrderTipoEnvioBadge tipo={o.tipo_envio} status={o.status} />
                          </TableCell>
                          <TableCell>
                            <OrderStatusBadge status={o.status} />
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {zonaObj?.nombre || '—'}
                          </TableCell>
                          <TableCell
                            className={
                              'hidden lg:table-cell ' +
                              (o.assigned_to
                                ? ''
                                : o.tipo_envio === 'retiro'
                                  ? 'text-muted-foreground'
                                  : 'text-destructive')
                            }
                          >
                            {repObj
                              ? repObj.name || repObj.email
                              : o.tipo_envio === 'retiro'
                                ? '—'
                                : 'Sin asignar'}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            ${Number(o.total).toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <OrderTimeBadge
                              iso={o.woo_created_at || o.created_at}
                              status={o.status}
                            />
                          </TableCell>
                          <TableCell>
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/pedidos/${o.id}`}>Ver</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vista kanban */}
        {viewMode === 'kanban' && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {STATUS_ORDER.map((status) => {
              const list = byStatus.get(status) ?? []
              if (statusFilter && status !== statusFilter) return null
              if (isPendientesFilter && !PENDIENTES_STATUSES.includes(status)) return null
              return (
                <Card key={status} className="flex min-h-[160px] flex-col gap-2 p-3">
                  <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {STATUS_LABELS[status]}
                    </CardTitle>
                    <Badge variant="secondary" className="tabular-nums">
                      {list.length}
                    </Badge>
                  </CardHeader>
                  {list.length === 0 ? (
                    <div className="py-3 text-xs text-muted-foreground">—</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {list.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          customerOrdersCount={
                            o.customer_id ? customerOrdersCount.get(o.customer_id) : undefined
                          }
                          hasIncident={incidentOrderIds.has(o.id)}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </section>
        )}
      </div>
    </CrmShell>
  )
}
