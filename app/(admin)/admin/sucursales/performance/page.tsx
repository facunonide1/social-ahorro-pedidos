import Link from 'next/link'
import { ArrowRight, Building, TrendingUp } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export default async function PerformanceSucursalesPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor'],
  })
  const sb = createClient()
  const periodoActual = new Date().toISOString().slice(0, 7)
  const inicioMes = periodoActual + '-01'

  const [sucRes, empRes, gastosRes, cajasRes, stockRes] = await Promise.all([
    sb
      .from('sucursales')
      .select('*')
      .eq('activa', true)
      .order('nombre'),
    sb.from('empleados').select('sucursal_id, activo').eq('activo', true),
    sb
      .from('gastos_operativos')
      .select('sucursal_id, monto, pagado')
      .eq('periodo', periodoActual),
    sb
      .from('cajas_diarias')
      .select('sucursal_id, estado, saldo_final_sistema, diferencia, fecha')
      .gte('fecha', inicioMes),
    sb
      .from('stock_sucursal')
      .select('sucursal_id, cantidad_actual, stock_minimo')
      .gt('stock_minimo', 0),
  ])

  if (sucRes.error) {
    return (
      <>
        <PageHeader title="Performance de sucursales" />
        <div className="p-4 md:p-6">
          <Alert variant="destructive">
            <AlertDescription>{sucRes.error.message}</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  const sucursales = (sucRes.data ?? []) as Sucursal[]

  type Row = {
    sucursal: Sucursal
    empleados: number
    gastoMes: number
    gastoPendiente: number
    cajasMes: number
    cajasAbiertas: number
    saldoCajaActual: number
    diferenciaAcum: number
    stockCriticoCount: number
  }

  const rows: Row[] = sucursales.map((s) => {
    const empleados = (empRes.data ?? []).filter(
      (e: any) => e.sucursal_id === s.id,
    ).length
    const gastosSuc = (gastosRes.data ?? []).filter(
      (g: any) => g.sucursal_id === s.id,
    )
    const gastoMes = gastosSuc.reduce(
      (a: number, g: any) => a + Number(g.monto || 0),
      0,
    )
    const gastoPendiente = gastosSuc
      .filter((g: any) => !g.pagado)
      .reduce((a: number, g: any) => a + Number(g.monto || 0), 0)
    const cajasSuc = (cajasRes.data ?? []).filter(
      (c: any) => c.sucursal_id === s.id,
    )
    const cajasAbiertas = cajasSuc.filter((c: any) => c.estado === 'abierta')
    const saldoCajaActual = cajasAbiertas.reduce(
      (a: number, c: any) => a + Number(c.saldo_final_sistema || 0),
      0,
    )
    const diferenciaAcum = cajasSuc
      .filter((c: any) => c.estado === 'cerrada' && c.diferencia != null)
      .reduce((a: number, c: any) => a + Number(c.diferencia || 0), 0)
    const stockCriticoCount = (stockRes.data ?? []).filter(
      (r: any) =>
        r.sucursal_id === s.id &&
        Number(r.cantidad_actual) <= Number(r.stock_minimo),
    ).length
    return {
      sucursal: s,
      empleados,
      gastoMes,
      gastoPendiente,
      cajasMes: cajasSuc.length,
      cajasAbiertas: cajasAbiertas.length,
      saldoCajaActual,
      diferenciaAcum,
      stockCriticoCount,
    }
  })

  const maxGasto = Math.max(...rows.map((r) => r.gastoMes), 1)

  return (
    <>
      <PageHeader
        title="Performance de sucursales"
        description={`Comparativa del mes ${periodoActual}.`}
        breadcrumbs={[{ label: 'Sucursales' }, { label: 'Performance' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {sucursales.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No hay sucursales activas cargadas.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.sucursal.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      {r.sucursal.nombre}
                    </CardTitle>
                    <div className="text-[10px] text-muted-foreground">
                      {r.empleados} empleado{r.empleados === 1 ? '' : 's'}{' '}
                      activo{r.empleados === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                {r.stockCriticoCount > 0 && (
                  <Badge variant="warning" className="text-[10px]">
                    {r.stockCriticoCount} stock crítico
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <Stat label="Gasto del mes" value={fmt(r.gastoMes)} />
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${(r.gastoMes / maxGasto) * 100}%`,
                    }}
                  />
                </div>
                {r.gastoPendiente > 0 && (
                  <div className="text-[10px] text-warning">
                    {fmt(r.gastoPendiente)} pendiente de pago
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                  <Stat
                    label="Cajas abiertas"
                    value={String(r.cajasAbiertas)}
                  />
                  <Stat label="Cajas del mes" value={String(r.cajasMes)} />
                  <Stat
                    label="Efectivo en caja"
                    value={fmt(r.saldoCajaActual)}
                  />
                  <Stat
                    label="Dif. acumulada"
                    value={fmt(r.diferenciaAcum)}
                    tone={r.diferenciaAcum !== 0 ? 'warning' : undefined}
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Link
                    href={`/admin/sucursales/${r.sucursal.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Ver sucursal
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="size-3" />
          Las ventas por sucursal aparecerán acá cuando los pedidos del CRM
          tengan tag de sucursal de despacho.
        </p>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warning' | 'success'
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </div>
    </div>
  )
}
