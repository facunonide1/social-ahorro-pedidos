import Link from 'next/link'
import { ArrowRight, Plus, Search } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Producto, StockSucursal } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type ProductoConStock = Producto & {
  stock_total: number
  stock_minimo_total: number
  sucursales_con_stock: number
  critico: boolean
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string; filtro?: string }
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

  const q = (searchParams.q || '').trim()
  const filtro = (searchParams.filtro || '').trim()

  let prodQuery = sb
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(500)
  if (q) {
    const like = `%${q}%`
    prodQuery = prodQuery.or(
      `nombre.ilike.${like},codigo_interno.ilike.${like},codigo_barras.ilike.${like},laboratorio.ilike.${like}`,
    )
  }

  const [prodRes, stockRes] = await Promise.all([
    prodQuery,
    sb.from('stock_sucursal').select('producto_id, cantidad_actual, stock_minimo'),
  ])

  const productos = (prodRes.data ?? []) as Producto[]
  const stockRows = (stockRes.data ?? []) as Pick<
    StockSucursal,
    'producto_id' | 'cantidad_actual' | 'stock_minimo'
  >[]

  const stockPorProducto = new Map<
    string,
    { total: number; minimo: number; sucursales: number }
  >()
  for (const s of stockRows) {
    const entry = stockPorProducto.get(s.producto_id) ?? {
      total: 0,
      minimo: 0,
      sucursales: 0,
    }
    entry.total += Number(s.cantidad_actual || 0)
    entry.minimo += Number(s.stock_minimo || 0)
    entry.sucursales += 1
    stockPorProducto.set(s.producto_id, entry)
  }

  let rows: ProductoConStock[] = productos.map((p) => {
    const st = stockPorProducto.get(p.id) ?? { total: 0, minimo: 0, sucursales: 0 }
    return {
      ...p,
      stock_total: st.total,
      stock_minimo_total: st.minimo,
      sucursales_con_stock: st.sucursales,
      critico: st.sucursales > 0 && st.total <= st.minimo,
    }
  })

  if (filtro === 'critico') rows = rows.filter((r) => r.critico)
  else if (filtro === 'sin_stock') rows = rows.filter((r) => r.stock_total <= 0)

  const criticos = rows.filter((r) => r.critico).length
  const sinStock = rows.filter((r) => r.stock_total <= 0).length
  const canCreate = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Stock e inventario"
        description={`${rows.length} producto${rows.length === 1 ? '' : 's'} activos`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/operaciones/stock/nuevo">
                <Plus className="size-4" />
                Nuevo producto
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {prodRes.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {prodRes.error.message}
              {prodRes.error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración <code>0024_operaciones_stock.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!prodRes.error && (
          <section className="grid grid-cols-3 gap-3">
            <KpiCard label="Productos" value={rows.length} />
            <KpiCard
              label="Stock crítico"
              value={criticos}
              variant={criticos > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              label="Sin stock"
              value={sinStock}
              variant={sinStock > 0 ? 'danger' : 'default'}
            />
          </section>
        )}

        <form className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, código o laboratorio…"
              className="pl-9"
            />
          </div>
          {filtro && <input type="hidden" name="filtro" value={filtro} />}
          <Button type="submit" variant="outline">
            Buscar
          </Button>
          <div className="flex gap-1.5">
            {[
              { key: '', label: 'Todos' },
              { key: 'critico', label: 'Crítico' },
              { key: 'sin_stock', label: 'Sin stock' },
            ].map((f) => (
              <Button
                key={f.key}
                asChild
                size="sm"
                variant={filtro === f.key ? 'default' : 'outline'}
                className="rounded-full"
              >
                <Link
                  href={`/hub/operaciones/stock?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(f.key ? { filtro: f.key } : {}),
                  })}`}
                >
                  {f.label}
                </Link>
              </Button>
            ))}
          </div>
        </form>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Laboratorio</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock total</TableHead>
                <TableHead className="text-right">Sucursales</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin productos para los filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/hub/operaciones/stock/${p.id}`}
                        className="hover:underline"
                      >
                        {p.nombre}
                      </Link>
                      {p.codigo_interno && (
                        <div className="font-mono text-xs font-normal text-muted-foreground">
                          {p.codigo_interno}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.laboratorio || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.categoria || '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        p.stock_total <= 0 && 'text-destructive',
                      )}
                    >
                      {p.stock_total.toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.sucursales_con_stock}
                    </TableCell>
                    <TableCell>
                      {p.stock_total <= 0 ? (
                        <Badge variant="destructive">Sin stock</Badge>
                      ) : p.critico ? (
                        <Badge variant="warning">Crítico</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/hub/operaciones/stock/${p.id}`}>
                          Ver
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </HubShell>
  )
}
