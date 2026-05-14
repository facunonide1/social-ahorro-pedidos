import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type {
  MovimientoStock,
  Producto,
  StockSucursal,
} from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import ProductoForm from '../nuevo/form'

export const dynamic = 'force-dynamic'

type StockRow = StockSucursal & {
  sucursales: { nombre: string | null } | null
}

export default async function ProductoDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'sucursal',
      'comprador',
      'auditor',
    ],
  })
  const sb = createClient()
  const tab = searchParams.tab === 'datos' ? 'datos' : 'stock'

  const [prodRes, stockRes, movsRes] = await Promise.all([
    sb.from('productos').select('*').eq('id', params.id).maybeSingle(),
    sb
      .from('stock_sucursal')
      .select('*, sucursales(nombre)')
      .eq('producto_id', params.id),
    sb
      .from('movimientos_stock')
      .select('*')
      .eq('producto_id', params.id)
      .order('fecha', { ascending: false })
      .limit(50),
  ])

  const p = prodRes.data as Producto | null
  if (!p) notFound()

  const stock = (stockRes.data ?? []) as StockRow[]
  const movimientos = (movsRes.data ?? []) as MovimientoStock[]
  const stockTotal = stock.reduce((a, s) => a + Number(s.cantidad_actual || 0), 0)
  const canEdit = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={p.nombre}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {p.codigo_interno && (
              <span className="font-mono text-xs">{p.codigo_interno}</span>
            )}
            {p.laboratorio && <span>· {p.laboratorio}</span>}
            {p.presentacion && <span>· {p.presentacion}</span>}
          </span>
        }
        breadcrumbs={[
          { label: 'Stock', href: '/hub/operaciones/stock' },
          { label: p.nombre },
        ]}
        actions={
          <Badge variant={p.activo ? 'success' : 'outline'}>
            {p.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        }
        tabs={[
          { label: 'Stock por sucursal', href: `/hub/operaciones/stock/${p.id}` },
          { label: 'Datos', href: `/hub/operaciones/stock/${p.id}?tab=datos` },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Stock total" value={stockTotal} />
          <KpiCard label="Sucursales" value={stock.length} />
          <KpiCard
            label="Precio costo"
            value={p.precio_costo ?? 0}
            format="currency"
          />
          <KpiCard
            label="Precio venta"
            value={p.precio_venta_sugerido ?? 0}
            format="currency"
            variant="success"
          />
        </section>

        {tab === 'stock' && (
          <>
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Stock por sucursal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sucursal</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead className="text-right">Máximo</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin stock cargado en ninguna sucursal.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stock.map((s) => {
                        const critico =
                          Number(s.cantidad_actual) <= Number(s.stock_minimo)
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              {s.sucursales?.nombre || '—'}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-semibold tabular-nums',
                                critico && 'text-destructive',
                              )}
                            >
                              {Number(s.cantidad_actual).toLocaleString('es-AR')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {Number(s.stock_minimo).toLocaleString('es-AR')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {s.stock_maximo != null
                                ? Number(s.stock_maximo).toLocaleString('es-AR')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.ubicacion || '—'}
                            </TableCell>
                            <TableCell>
                              {critico ? (
                                <Badge variant="warning">Crítico</Badge>
                              ) : (
                                <Badge variant="success">OK</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Movimientos recientes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin movimientos registrados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movimientos.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground">
                            {new Date(m.fecha).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </TableCell>
                          <TableCell className="capitalize">
                            {m.tipo.replace('_', ' ')}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold tabular-nums',
                              Number(m.cantidad) < 0
                                ? 'text-destructive'
                                : 'text-success',
                            )}
                          >
                            {Number(m.cantidad) > 0 ? '+' : ''}
                            {Number(m.cantidad).toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {m.motivo || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {tab === 'datos' && canEdit && (
          <ProductoForm mode="edit" initial={p} />
        )}
        {tab === 'datos' && !canEdit && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No tenés permiso para editar productos.
            </CardContent>
          </Card>
        )}
      </div>
    </HubShell>
  )
}
