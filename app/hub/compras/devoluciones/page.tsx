import Link from 'next/link'
import { Plus } from 'lucide-react'

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

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

type Row = DevolucionProveedor & {
  proveedores: { razon_social: string | null } | null
  sucursales: { nombre: string | null } | null
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

export default async function DevolucionesPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('devoluciones_proveedor')
    .select('*, proveedores(razon_social), sucursales(nombre)')
    .order('fecha', { ascending: false })
    .limit(300)

  const rows = (rawRows ?? []) as Row[]

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Devoluciones a proveedor"
        description={`${rows.length} devolución${rows.length === 1 ? '' : 'es'}`}
        actions={
          <Button asChild>
            <Link href="/hub/compras/devoluciones/nueva">
              <Plus className="size-4" />
              Nueva devolución
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>
                    0025_operaciones_transferencias_inventarios_devoluciones.sql
                  </code>
                  .
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Remito</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin devoluciones registradas.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.fecha).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.proveedores?.razon_social || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.sucursales?.nombre || '—'}
                    </TableCell>
                    <TableCell>{MOTIVO_DEVOLUCION_LABELS[r.motivo]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.numero_remito_devolucion || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[r.estado]}>
                        {ESTADO_DEVOLUCION_LABELS[r.estado]}
                      </Badge>
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
