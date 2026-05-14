import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { LoteProducto } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
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

type LoteRow = LoteProducto & {
  productos: { nombre: string | null; laboratorio: string | null } | null
  sucursales: { nombre: string | null } | null
}

const VENTANAS = [30, 60, 90]

function diasHasta(fecha: string): number {
  return Math.floor(
    (new Date(fecha).getTime() - Date.now()) / 86400000,
  )
}

export default async function VencimientosPage({
  searchParams,
}: {
  searchParams: { dias?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'],
  })
  const sb = createClient()

  const dias = VENTANAS.includes(Number(searchParams.dias))
    ? Number(searchParams.dias)
    : 30

  const limite = new Date()
  limite.setDate(limite.getDate() + dias)

  const { data: rawRows, error } = await sb
    .from('lotes_productos')
    .select('*, productos(nombre, laboratorio), sucursales(nombre)')
    .gt('cantidad_actual', 0)
    .lte('fecha_vencimiento', limite.toISOString().slice(0, 10))
    .order('fecha_vencimiento', { ascending: true })
    .limit(500)

  const rows = (rawRows ?? []) as LoteRow[]
  const vencidos = rows.filter((r) => diasHasta(r.fecha_vencimiento) < 0).length
  const en30 = rows.filter((r) => {
    const d = diasHasta(r.fecha_vencimiento)
    return d >= 0 && d <= 30
  }).length
  const unidadesEnRiesgo = rows.reduce(
    (a, r) => a + Number(r.cantidad_actual || 0),
    0,
  )

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Control de vencimientos"
        description={`Lotes que vencen dentro de ${dias} días`}
        actions={
          <div className="flex gap-1.5">
            {VENTANAS.map((v) => (
              <Button
                key={v}
                asChild
                size="sm"
                variant={dias === v ? 'default' : 'outline'}
                className="rounded-full"
              >
                <Link href={`/hub/operaciones/vencimientos?dias=${v}`}>
                  {v} días
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración <code>0024_operaciones_stock.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Vencidos"
              value={vencidos}
              variant={vencidos > 0 ? 'danger' : 'default'}
            />
            <KpiCard
              label="Vencen en 30d"
              value={en30}
              variant={en30 > 0 ? 'warning' : 'default'}
            />
            <KpiCard label="Unidades en riesgo" value={unidadesEnRiesgo} />
          </section>
        )}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Vencimiento</TableHead>
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
                    Sin lotes próximos a vencer en esta ventana. 👍
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const d = diasHasta(r.fecha_vencimiento)
                  const variant =
                    d < 0 ? 'destructive' : d <= 30 ? 'warning' : d <= 60 ? 'info' : 'success'
                  const texto =
                    d < 0
                      ? `Vencido hace ${-d}d`
                      : d === 0
                        ? 'Vence hoy'
                        : `Vence en ${d}d`
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.productos?.nombre || '—'}
                        {r.productos?.laboratorio && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {r.productos.laboratorio}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.numero_lote || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.sucursales?.nombre || '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {Number(r.cantidad_actual).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{texto}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Las acciones (devolver al proveedor, marcar vencido, promocionar)
          requieren los flujos de devoluciones y movimientos de stock. Ver{' '}
          <code>docs/ERP-PROGRESO.md</code>.
        </p>
      </div>
    </HubShell>
  )
}
