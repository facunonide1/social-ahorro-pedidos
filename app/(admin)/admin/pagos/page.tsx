import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { METODO_PAGO_LABELS } from '@/lib/types/admin'
import type { Pago } from '@/lib/types/admin'

import { PagoEstadoBadge } from '@/components/hub/pago-estado-badge'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

type PagoRow = Pago & {
  proveedores: { razon_social: string | null } | null
  pago_facturas?: { count: number }[] | null
}

export default async function PagosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('pagos')
    .select('*, proveedores(razon_social), pago_facturas(count)')
    .order('fecha_pago', { ascending: false })
    .limit(500)

  const rows = (rawRows ?? []) as PagoRow[]
  const canCreate = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)

  return (
    <>
      <PageHeader
        title="Pagos a proveedores"
        description={`${rows.length} órden${rows.length === 1 ? '' : 'es'} de pago`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/pagos/nuevo">
                <Plus className="size-4" />
                Nueva OP
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OP</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Facturas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    Sin pagos cargados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const apliCount = Array.isArray(r.pago_facturas)
                    ? r.pago_facturas[0]?.count ?? 0
                    : 0
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-bold">
                        <Link
                          href={`/hub/pagos/${r.id}`}
                          className="hover:underline"
                        >
                          {r.numero_orden_pago || '—'}
                        </Link>
                      </TableCell>
                      <TableCell>{r.proveedores?.razon_social || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.fecha_pago).toLocaleDateString('es-AR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {METODO_PAGO_LABELS[r.metodo_pago]}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        ${Number(r.monto_total).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {apliCount}
                      </TableCell>
                      <TableCell>
                        <PagoEstadoBadge estado={r.estado} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/hub/pagos/${r.id}`}>
                            Ver
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  )
}
