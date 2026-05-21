import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { InventarioFisico, InventarioItem } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
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

import Conteo, { type ConteoRow } from './conteo'

export const dynamic = 'force-dynamic'

type InvDetail = InventarioFisico & {
  sucursales: { nombre: string | null } | null
}

type StockLine = {
  producto_id: string
  cantidad_actual: number
  productos: { nombre: string | null; codigo_interno: string | null } | null
}

type ItemRow = InventarioItem & {
  productos: { nombre: string | null; codigo_interno: string | null } | null
}

export default async function InventarioDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const { data: invData } = await sb
    .from('inventarios_fisicos')
    .select('*, sucursales(nombre)')
    .eq('id', params.id)
    .maybeSingle()

  const inv = invData as unknown as InvDetail | null
  if (!inv) notFound()

  const [stockRes, itemsRes] = await Promise.all([
    sb
      .from('stock_sucursal')
      .select('producto_id, cantidad_actual, productos(nombre, codigo_interno)')
      .eq('sucursal_id', inv.sucursal_id),
    sb
      .from('inventario_items')
      .select('*, productos(nombre, codigo_interno)')
      .eq('inventario_id', inv.id),
  ])

  const stockLines = (stockRes.data ?? []) as unknown as StockLine[]
  const items = (itemsRes.data ?? []) as unknown as ItemRow[]
  const itemByProducto = new Map(items.map((it) => [it.producto_id, it]))

  const canManage = ['super_admin', 'gerente', 'administrativo', 'sucursal'].includes(
    profile.rol,
  )
  const abierto = inv.estado === 'en_curso'

  // Líneas a contar: el stock actual de la sucursal, más cualquier item ya
  // guardado que no figure en el stock (producto contado de más).
  const rows: ConteoRow[] = stockLines.map((s) => {
    const saved = itemByProducto.get(s.producto_id)
    return {
      producto_id: s.producto_id,
      nombre: s.productos?.nombre || '—',
      codigo: s.productos?.codigo_interno ?? null,
      stock_sistema: saved ? Number(saved.stock_sistema) : Number(s.cantidad_actual),
      stock_contado: saved?.stock_contado != null ? Number(saved.stock_contado) : null,
    }
  })
  const enStock = new Set(stockLines.map((s) => s.producto_id))
  for (const it of items) {
    if (!enStock.has(it.producto_id)) {
      rows.push({
        producto_id: it.producto_id,
        nombre: it.productos?.nombre || '—',
        codigo: it.productos?.codigo_interno ?? null,
        stock_sistema: Number(it.stock_sistema),
        stock_contado: it.stock_contado != null ? Number(it.stock_contado) : null,
      })
    }
  }
  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={`Inventario · ${inv.sucursales?.nombre || '—'}`}
        description={`${new Date(inv.fecha_inventario).toLocaleDateString('es-AR')}`}
        breadcrumbs={[
          { label: 'Inventarios', href: '/hub/operaciones/inventarios' },
          { label: 'Detalle' },
        ]}
        actions={
          <Badge variant={inv.estado === 'cerrado' ? 'success' : 'warning'}>
            {inv.estado === 'cerrado' ? 'Cerrado' : 'En curso'}
          </Badge>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        {abierto && canManage ? (
          <Conteo inventarioId={inv.id} rows={rows} />
        ) : (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Conteo {inv.estado === 'cerrado' ? 'final' : 'registrado'} ·{' '}
                {inv.total_items_contados} items · {inv.diferencias_detectadas}{' '}
                diferencia{inv.diferencias_detectadas === 1 ? '' : 's'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No se registraron conteos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items
                      .slice()
                      .sort((a, b) =>
                        (a.productos?.nombre || '').localeCompare(
                          b.productos?.nombre || '',
                          'es',
                        ),
                      )
                      .map((it) => {
                        const dif = it.diferencia != null ? Number(it.diferencia) : 0
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="font-medium">
                              {it.productos?.nombre || '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {Number(it.stock_sistema).toLocaleString('es-AR')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {it.stock_contado != null
                                ? Number(it.stock_contado).toLocaleString('es-AR')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {dif === 0 ? (
                                <span className="text-muted-foreground">0</span>
                              ) : (
                                <span
                                  className={
                                    dif > 0
                                      ? 'font-semibold text-emerald-600'
                                      : 'font-semibold text-destructive'
                                  }
                                >
                                  {dif > 0 ? '+' : ''}
                                  {dif.toLocaleString('es-AR')}
                                </span>
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
        )}

        {inv.observaciones && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">
              {inv.observaciones}
            </CardContent>
          </Card>
        )}
      </div>
    </HubShell>
  )
}
