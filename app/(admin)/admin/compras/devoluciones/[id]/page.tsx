import { notFound } from 'next/navigation'
import { Comprobantes } from '@/components/shared/comprobantes'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import {
  ESTADO_DEVOLUCION_LABELS,
  MOTIVO_DEVOLUCION_LABELS,
} from '@/lib/types/admin'
import type {
  DevolucionProveedor,
  EstadoDevolucionProveedor,
} from '@/lib/types/admin'

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

import DevolucionEstadoActions from './estado-actions'

export const dynamic = 'force-dynamic'

type DevDetail = DevolucionProveedor & {
  proveedores: { razon_social: string | null } | null
  sucursales: { nombre: string | null } | null
}

type ItemRow = {
  id: string
  cantidad: number
  lote: string | null
  fecha_vencimiento_producto: string | null
  motivo_especifico: string | null
  observaciones: string | null
  productos: { nombre: string | null } | null
}

const ESTADO_VARIANT: Record<
  EstadoDevolucionProveedor,
  React.ComponentProps<typeof Badge>['variant']
> = {
  registrada: 'warning',
  enviada: 'info',
  nota_credito_recibida: 'info',
  cerrada: 'success',
}

export default async function DevolucionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })
  const sb = createClient()

  const [devRes, itemsRes] = await Promise.all([
    sb
      .from('devoluciones_proveedor')
      .select('*, proveedores(razon_social), sucursales(nombre)')
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('devolucion_items')
      .select('*, productos(nombre)')
      .eq('devolucion_id', params.id),
  ])

  const d = devRes.data as unknown as DevDetail | null
  if (!d) notFound()

  const items = (itemsRes.data ?? []) as unknown as ItemRow[]
  const canManage = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )

  return (
    <>
      <PageHeader
        title={`Devolución · ${d.proveedores?.razon_social || '—'}`}
        description={`${new Date(d.fecha).toLocaleDateString('es-AR')} · ${MOTIVO_DEVOLUCION_LABELS[d.motivo]}`}
        breadcrumbs={[
          { label: 'Devoluciones', href: '/admin/compras/devoluciones' },
          { label: 'Detalle' },
        ]}
        actions={
          <Badge variant={ESTADO_VARIANT[d.estado]}>
            {ESTADO_DEVOLUCION_LABELS[d.estado]}
          </Badge>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        {canManage && (
          <DevolucionEstadoActions devolucionId={d.id} currentEstado={d.estado} />
        )}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Datos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sucursal
              </div>
              {d.sucursales?.nombre || '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Remito de devolución
              </div>
              <span className="font-mono text-xs">
                {d.numero_remito_devolucion || '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Productos ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sin productos en esta devolución.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.productos?.nombre || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(it.cantidad).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {it.lote || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {it.fecha_vencimiento_producto
                          ? new Date(
                              it.fecha_vencimiento_producto,
                            ).toLocaleDateString('es-AR')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {it.motivo_especifico || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {d.observaciones && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">
              {d.observaciones}
            </CardContent>
          </Card>
        )}

        <Comprobantes entidadTipo="devolucion" entidadId={params.id} titulo="Fotos mercadería / remito" />
      </div>
    </>
  )
}
