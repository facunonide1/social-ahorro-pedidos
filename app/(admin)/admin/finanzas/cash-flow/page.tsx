import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const PERIODOS = [
  { dias: 30, label: '30 días' },
  { dias: 60, label: '60 días' },
  { dias: 90, label: '90 días' },
]

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: { dias?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
  })
  const sb = createClient()

  const dias = [30, 60, 90].includes(Number(searchParams.dias))
    ? Number(searchParams.dias)
    : 30

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fin = new Date(hoy)
  fin.setDate(fin.getDate() + dias)
  const hace30 = new Date(hoy)
  hace30.setDate(hace30.getDate() - 30)

  const [cuentasRes, facturasRes, ventasRes] = await Promise.all([
    sb.from('cuentas_bancarias_con_saldo').select('saldo_actual, moneda, activa'),
    sb
      .from('facturas_proveedor')
      .select('fecha_vencimiento, total, estado')
      .gte('fecha_vencimiento', isoDate(hoy))
      .lte('fecha_vencimiento', isoDate(fin))
      .not('estado', 'in', '(pagada,anulada,rechazada)'),
    sb
      .from('orders')
      .select('total, status, created_at')
      .gte('created_at', hace30.toISOString())
      .neq('status', 'cancelado'),
  ])

  const errMigracion =
    cuentasRes.error?.message.includes('does not exist') ?? false

  const saldoInicial = (
    (cuentasRes.data ?? []) as { saldo_actual: number; moneda: string; activa: boolean }[]
  )
    .filter((c) => c.moneda === 'ARS' && c.activa)
    .reduce((a, c) => a + Number(c.saldo_actual || 0), 0)

  const facturas = (facturasRes.data ?? []) as {
    fecha_vencimiento: string
    total: number
  }[]
  const egresosTotales = facturas.reduce((a, f) => a + Number(f.total || 0), 0)

  const ventas = (ventasRes.data ?? []) as { total: number }[]
  const ventaPromedioDiaria =
    ventas.length > 0
      ? ventas.reduce((a, v) => a + Number(v.total || 0), 0) / 30
      : 0
  const ingresosProyectados = ventaPromedioDiaria * dias

  // Proyección semana a semana
  const egresosPorDia = new Map<string, number>()
  for (const f of facturas) {
    egresosPorDia.set(
      f.fecha_vencimiento,
      (egresosPorDia.get(f.fecha_vencimiento) ?? 0) + Number(f.total || 0),
    )
  }

  type Semana = {
    desde: Date
    hasta: Date
    egresos: number
    ingresos: number
    saldoFinal: number
  }
  const semanas: Semana[] = []
  let saldoCorriente = saldoInicial
  for (let offset = 0; offset < dias; offset += 7) {
    const desde = new Date(hoy)
    desde.setDate(desde.getDate() + offset)
    const hasta = new Date(desde)
    hasta.setDate(hasta.getDate() + 6)
    let egresosSemana = 0
    for (const [fecha, monto] of egresosPorDia) {
      const d = new Date(fecha + 'T00:00:00')
      if (d >= desde && d <= hasta) egresosSemana += monto
    }
    const ingresosSemana = ventaPromedioDiaria * 7
    saldoCorriente = saldoCorriente + ingresosSemana - egresosSemana
    semanas.push({
      desde,
      hasta,
      egresos: egresosSemana,
      ingresos: ingresosSemana,
      saldoFinal: saldoCorriente,
    })
  }

  const saldoProyectadoFinal = saldoInicial + ingresosProyectados - egresosTotales
  const hayDiasNegativos = semanas.some((s) => s.saldoFinal < 0)

  return (
    <>
      <PageHeader
        title="Cash flow proyectado"
        description="Proyección de caja basada en facturas a vencer e ingresos promedio de ventas."
        actions={
          <div className="flex gap-1.5">
            {PERIODOS.map((p) => (
              <Button
                key={p.dias}
                asChild
                size="sm"
                variant={dias === p.dias ? 'default' : 'outline'}
                className="rounded-full"
              >
                <Link href={`/hub/finanzas/cash-flow?dias=${p.dias}`}>
                  {p.label}
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        {errMigracion && (
          <Alert variant="destructive">
            <AlertDescription>
              Faltan tablas de finanzas. Aplicá las migraciones{' '}
              <code>0020-0022</code>.
            </AlertDescription>
          </Alert>
        )}

        {hayDiasNegativos && (
          <Alert variant="warning">
            <AlertDescription>
              ⚠ La proyección tiene semanas con saldo negativo. Revisá los
              egresos comprometidos o adelantá ingresos.
            </AlertDescription>
          </Alert>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Saldo inicial"
            value={saldoInicial}
            format="currency"
            variant={saldoInicial < 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label={`Egresos ${dias}d`}
            value={egresosTotales}
            format="currency"
            variant="danger"
          />
          <KpiCard
            label={`Ingresos est. ${dias}d`}
            value={ingresosProyectados}
            format="currency"
            variant="success"
          />
          <KpiCard
            label="Saldo proyectado"
            value={saldoProyectadoFinal}
            format="currency"
            variant={saldoProyectadoFinal < 0 ? 'danger' : 'success'}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Proyección semanal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Ingresos est.</TableHead>
                  <TableHead className="text-right">Egresos</TableHead>
                  <TableHead className="text-right">Saldo proyectado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semanas.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">
                      {s.desde.toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      –{' '}
                      {s.hasta.toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      +${Math.round(s.ingresos).toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      -${Math.round(s.egresos).toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-bold tabular-nums',
                        s.saldoFinal < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      ${Math.round(s.saldoFinal).toLocaleString('es-AR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Ingresos proyectados = promedio diario de ventas de los últimos 30 días
          ($
          {Math.round(ventaPromedioDiaria).toLocaleString('es-AR')}/día) × días del
          período. Egresos = facturas de proveedor a vencer en estado no pagado.
          Para una proyección con ajuste manual de ingresos, ver{' '}
          <code>docs/ERP-PROGRESO.md</code>.
        </p>
      </div>
    </>
  )
}
