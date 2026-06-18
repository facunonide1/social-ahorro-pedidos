import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ESTADO_TRANSFERENCIA_LABELS } from '@/lib/types/admin'
import type { EstadoTransferencia, TransferenciaSucursal } from '@/lib/types/admin'

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

import TransferenciaEstadoActions from './estado-actions'

export const dynamic = 'force-dynamic'

type TransDetail = TransferenciaSucursal & {
  origen: { nombre: string | null } | null
  destino: { nombre: string | null } | null
}

type ItemRow = {
  id: string
  cantidad_solicitada: number
  cantidad_enviada: number | null
  cantidad_recibida: number | null
  observaciones: string | null
  productos: { nombre: string | null } | null
}

const ESTADO_VARIANT: Record<
  EstadoTransferencia,
  React.ComponentProps<typeof Badge>['variant']
> = {
  solicitada: 'warning',
  aprobada: 'info',
  en_transito: 'info',
  recibida: 'success',
  cancelada: 'outline',
}

export default async function TransferenciaDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const [transRes, itemsRes] = await Promise.all([
    sb
      .from('transferencias_sucursal')
      .select(
        '*, origen:sucursales!transferencias_sucursal_sucursal_origen_id_fkey(nombre), destino:sucursales!transferencias_sucursal_sucursal_destino_id_fkey(nombre)',
      )
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('transferencia_items')
      .select('*, productos(nombre)')
      .eq('transferencia_id', params.id),
  ])

  const t = transRes.data as TransDetail | null
  if (!t) notFound()

  const items = (itemsRes.data ?? []) as ItemRow[]
  const canManage = ['super_admin', 'gerente', 'administrativo'].includes(profile.rol)

  return (
    <>
      <PageHeader
        title={`${t.origen?.nombre || '—'} → ${t.destino?.nombre || '—'}`}
        description={`Solicitada el ${new Date(t.fecha_solicitud).toLocaleDateString('es-AR')}`}
        breadcrumbs={[
          { label: 'Transferencias', href: '/admin/operaciones/transferencias' },
          { label: 'Detalle' },
        ]}
        actions={
          <Badge variant={ESTADO_VARIANT[t.estado]}>
            {ESTADO_TRANSFERENCIA_LABELS[t.estado]}
          </Badge>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        {canManage && (
          <TransferenciaEstadoActions
            transferenciaId={t.id}
            currentEstado={t.estado}
          />
        )}

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
                  <TableHead className="text-right">Solicitado</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="text-right">Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sin productos en esta transferencia.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.productos?.nombre || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(it.cantidad_solicitada).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {it.cantidad_enviada != null
                          ? Number(it.cantidad_enviada).toLocaleString('es-AR')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {it.cantidad_recibida != null
                          ? Number(it.cantidad_recibida).toLocaleString('es-AR')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {t.observaciones && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">
              {t.observaciones}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
