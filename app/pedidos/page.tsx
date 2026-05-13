import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Download, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserPedidos, ZonaReparto } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'

import { CrmShell } from '@/components/crm/crm-shell'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { OrderTimeBadge } from '@/components/crm/order-time-badge'
import { PageHeader } from '@/components/shared/page-header'
import { PageActions } from '@/components/shared/page-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function PedidosListPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    status?: string
    tipo?: string
    zona?: string
    rep?: string
    page?: string
  }
}) {
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
  const status = (searchParams.status || '').trim() as OrderStatus | ''
  const tipo = (searchParams.tipo || '').trim() as TipoEnvio | ''
  const zona = (searchParams.zona || '').trim()
  const rep = (searchParams.rep || '').trim()
  const page = Math.max(1, Number(searchParams.page) || 1)

  const [zonasRes, repsRes] = await Promise.all([
    sb
      .from('zonas_reparto')
      .select('id, nombre, activa')
      .order('activa', { ascending: false })
      .order('nombre', { ascending: true }),
    sb
      .from('users_pedidos')
      .select('id, name, email')
      .eq('role', 'repartidor')
      .eq('active', true)
      .order('name', { ascending: true }),
  ])

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = sb
    .from('orders')
    .select('*', { count: 'exact' })
    .order('woo_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)
  if (tipo) query = query.eq('tipo_envio', tipo)
  if (zona === 'sin_zona') query = query.is('zona_id', null)
  else if (zona) query = query.eq('zona_id', zona)
  if (rep === 'sin_asignar') query = query.is('assigned_to', null)
  else if (rep) query = query.eq('assigned_to', rep)
  if (q) {
    const like = `%${q}%`
    const orFilters = [
      `codigo.ilike.${like}`,
      `customer_name.ilike.${like}`,
      `customer_phone.ilike.${like}`,
      `customer_dni.ilike.${like}`,
    ]
    query = query.or(orFilters.join(','))
  }

  const { data: orders, count, error } = await query

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  const exportHref = `/api/orders/export?${new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString()}`

  return (
    <CrmShell>
      <PageHeader
        title="Pedidos"
        description={
          <span className="tabular-nums">
            {count ?? 0} {count === 1 ? 'pedido' : 'pedidos'}
            {q && <span className="ml-1">· filtro &ldquo;{q}&rdquo;</span>}
          </span>
        }
        actions={
          <PageActions>
            <Button asChild variant="outline" size="sm">
              <a href={exportHref}>
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
          </PageActions>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        <Card>
          <CardContent className="p-4">
            <form className="flex flex-wrap gap-2" action="/pedidos">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Buscar SA-2026-XXXX, nombre, DNI, tel…"
                className="min-w-[240px] flex-1"
              />
              <Select name="status" defaultValue={status || 'all'}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select name="tipo" defaultValue={tipo || 'all'}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                  <SelectItem value="programado">Programado</SelectItem>
                  <SelectItem value="retiro">Retiro</SelectItem>
                </SelectContent>
              </Select>
              <Select name="zona" defaultValue={zona || 'all'}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las zonas</SelectItem>
                  <SelectItem value="sin_zona">Sin zona</SelectItem>
                  {(zonasRes.data ?? [])
                    .filter((z) => z.activa)
                    .map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select name="rep" defaultValue={rep || 'all'}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Repartidor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                  {(repsRes.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name || r.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit">Aplicar</Button>
              {(q || status || tipo || zona || rep) && (
                <Button asChild variant="ghost">
                  <Link href="/pedidos">Limpiar</Link>
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="p-4 text-sm text-destructive">
              Error cargando pedidos: {error.message}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead className="hidden md:table-cell">Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden lg:table-cell">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="hidden xl:table-cell">Repartidor</TableHead>
                    <TableHead className="hidden md:table-cell">Antigüedad</TableHead>
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
                    const order = o as Order
                    const repObj = (repsRes.data ?? []).find((r) => r.id === order.assigned_to)
                    return (
                      <TableRow key={order.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell className="font-bold">{formatOrderNumber(order)}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                          {new Date(order.woo_created_at || order.created_at).toLocaleString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>{order.customer_name || '—'}</TableCell>
                        <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                          {order.items?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          ${Number(order.total).toLocaleString('es-AR')}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <OrderTipoEnvioBadge tipo={order.tipo_envio} status={order.status} />
                        </TableCell>
                        <TableCell
                          className={
                            'hidden xl:table-cell ' +
                            (order.assigned_to
                              ? 'text-foreground'
                              : order.tipo_envio === 'retiro'
                                ? 'text-muted-foreground'
                                : 'text-destructive')
                          }
                        >
                          {repObj
                            ? repObj.name || repObj.email
                            : order.tipo_envio === 'retiro'
                              ? '—'
                              : 'Sin asignar'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <OrderTimeBadge
                            iso={order.woo_created_at || order.created_at}
                            status={order.status}
                          />
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/pedidos/${order.id}`}>Ver</Link>
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {count ?? 0} resultados
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={{
                      pathname: '/pedidos',
                      query: { ...searchParams, page: page - 1 },
                    }}
                  >
                    Anterior
                  </Link>
                </Button>
              )}
              {page < totalPages && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={{
                      pathname: '/pedidos',
                      query: { ...searchParams, page: page + 1 },
                    }}
                  >
                    Siguiente
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmShell>
  )
}
