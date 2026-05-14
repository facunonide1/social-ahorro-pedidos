import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ESTADO_TRANSFERENCIA_LABELS } from '@/lib/types/admin'
import type { EstadoTransferencia, TransferenciaSucursal } from '@/lib/types/admin'

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

type Row = TransferenciaSucursal & {
  origen: { nombre: string | null } | null
  destino: { nombre: string | null } | null
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

export default async function TransferenciasPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('transferencias_sucursal')
    .select(
      '*, origen:sucursales!transferencias_sucursal_sucursal_origen_id_fkey(nombre), destino:sucursales!transferencias_sucursal_sucursal_destino_id_fkey(nombre)',
    )
    .order('fecha_solicitud', { ascending: false })
    .limit(300)

  const rows = (rawRows ?? []) as Row[]

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Transferencias entre sucursales"
        description={`${rows.length} transferencia${rows.length === 1 ? '' : 's'}`}
        actions={
          <Button asChild>
            <Link href="/hub/operaciones/transferencias/nueva">
              <Plus className="size-4" />
              Nueva transferencia
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
                <TableHead>Solicitud</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin transferencias registradas.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.fecha_solicitud).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.origen?.nombre || '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.destino?.nombre || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[r.estado]}>
                        {ESTADO_TRANSFERENCIA_LABELS[r.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/hub/operaciones/transferencias/${r.id}`}>
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
