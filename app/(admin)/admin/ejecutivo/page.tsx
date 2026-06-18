import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckSquare,
  FileText,
  Landmark,
  TrendingUp,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function isoDaysAgo(d: number): string {
  const x = new Date()
  x.setDate(x.getDate() - d)
  return x.toISOString()
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function DashboardEjecutivoPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor'],
  })
  const sb = createClient()
  const hoy = todayISO()
  const desdeHoy = hoy + 'T00:00:00'
  const mesActual = hoy.slice(0, 7)

  const [
    ventasHoyRes,
    ventasMesRes,
    pedidosAbiertosRes,
    cuentasRes,
    facturasVencidasRes,
    stockCriticoRes,
    aprobacionesRes,
    gastosMesRes,
    cajasAbiertasRes,
  ] = await Promise.all([
    sb.from('orders').select('total, status').gte('created_at', desdeHoy),
    sb.from('orders').select('total, status').gte('created_at', isoDaysAgo(30)),
    sb
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '("entregado","cancelado")'),
    sb
      .from('cuentas_bancarias_con_saldo')
      .select('moneda, saldo_actual, activa'),
    sb
      .from('facturas_proveedor')
      .select('id, total', { count: 'exact' })
      .lt('fecha_vencimiento', hoy)
      .not('estado', 'in', '("pagada","anulada","rechazada")'),
    sb
      .from('stock_sucursal')
      .select('cantidad_actual, stock_minimo')
      .gt('stock_minimo', 0)
      .order('cantidad_actual', { ascending: true })
      .limit(500),
    sb
      .from('aprobaciones')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'solicita_info']),
    sb
      .from('gastos_operativos')
      .select('monto')
      .eq('periodo', mesActual),
    sb
      .from('cajas_diarias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'abierta'),
  ])

  const ventasHoy = (ventasHoyRes.data ?? [])
    .filter((o: any) => o.status !== 'cancelado')
    .reduce((a: number, o: any) => a + Number(o.total || 0), 0)
  const ventasMes = (ventasMesRes.data ?? [])
    .filter((o: any) => o.status !== 'cancelado')
    .reduce((a: number, o: any) => a + Number(o.total || 0), 0)
  const pedidosAbiertos = pedidosAbiertosRes.count ?? 0

  const cuentas = (cuentasRes.data ?? []).filter((c: any) => c.activa)
  const saldoARS = cuentas
    .filter((c: any) => c.moneda === 'ARS')
    .reduce((a: number, c: any) => a + Number(c.saldo_actual || 0), 0)

  const facturasVencidasCount = facturasVencidasRes.count ?? 0
  const facturasVencidasMonto = (facturasVencidasRes.data ?? []).reduce(
    (a: number, f: any) => a + Number(f.total || 0),
    0,
  )

  const stockCritico = (stockCriticoRes.data ?? []).filter(
    (r: any) => Number(r.cantidad_actual) <= Number(r.stock_minimo),
  ).length

  const aprobacionesPendientes = aprobacionesRes.count ?? 0

  const gastosMes = (gastosMesRes.data ?? []).reduce(
    (a: number, g: any) => a + Number(g.monto || 0),
    0,
  )

  const cajasAbiertas = cajasAbiertasRes.count ?? 0

  const margenMes = ventasMes - gastosMes

  return (
    <>
      <PageHeader
        title="Dashboard ejecutivo"
        description="Vista consolidada para gerencia: ventas, finanzas, operaciones y alertas en una pantalla."
        breadcrumbs={[{ label: 'Ejecutivo' }]}
      />

      <div className="space-y-6 p-4 md:p-6">
        {/* Top-line */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Performance
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Ventas hoy"
              value={ventasHoy}
              format="currency"
              variant="success"
            />
            <KpiCard label="Ventas 30d" value={ventasMes} format="currency" />
            <KpiCard label="Gasto del mes" value={gastosMes} format="currency" />
            <KpiCard
              label="Margen del mes"
              value={margenMes}
              format="currency"
              variant={margenMes < 0 ? 'danger' : 'success'}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Caja y operaciones
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Saldo bancario ARS"
              value={saldoARS}
              format="currency"
              variant={saldoARS < 0 ? 'danger' : 'default'}
            />
            <KpiCard label="Cajas abiertas" value={cajasAbiertas} />
            <KpiCard label="Pedidos en curso" value={pedidosAbiertos} />
            <KpiCard
              label="Aprobaciones pendientes"
              value={aprobacionesPendientes}
              variant={aprobacionesPendientes > 0 ? 'warning' : 'default'}
            />
          </div>
        </section>

        {/* Alertas */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Alertas que requieren acción
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AlertTile
              icon={FileText}
              titulo="Facturas vencidas"
              count={facturasVencidasCount}
              monto={facturasVencidasMonto}
              href="/hub/facturas"
              tone={facturasVencidasCount > 0 ? 'destructive' : 'muted'}
            />
            <AlertTile
              icon={Boxes}
              titulo="Stock crítico"
              count={stockCritico}
              href="/hub/operaciones/stock"
              tone={stockCritico > 0 ? 'warning' : 'muted'}
              subtitulo="productos por debajo del mínimo"
            />
            <AlertTile
              icon={CheckSquare}
              titulo="Aprobaciones por resolver"
              count={aprobacionesPendientes}
              href="/hub/aprobaciones"
              tone={aprobacionesPendientes > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* Atajos */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Atajos
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ShortcutCard
              icon={TrendingUp}
              label="BI / Charts"
              href="/hub/bi"
            />
            <ShortcutCard
              icon={Landmark}
              label="Cash flow"
              href="/hub/finanzas/cash-flow"
            />
            <ShortcutCard
              icon={CheckSquare}
              label="Aprobaciones"
              href="/hub/aprobaciones"
            />
            <ShortcutCard
              icon={AlertTriangle}
              label="Resumen IA del día"
              href="/hub/ia/resumen"
            />
          </div>
        </section>
      </div>
    </>
  )
}

function AlertTile({
  icon: Icon,
  titulo,
  count,
  monto,
  href,
  tone,
  subtitulo,
}: {
  icon: typeof FileText
  titulo: string
  count: number
  monto?: number
  href: string
  tone: 'destructive' | 'warning' | 'muted'
  subtitulo?: string
}) {
  return (
    <Link href={href} className="group">
      <Card
        className={cn(
          'h-full transition-colors',
          tone === 'destructive' && 'border-destructive/40',
          tone === 'warning' && 'border-warning/40',
          tone === 'muted' && 'opacity-70',
        )}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md',
              tone === 'destructive' && 'bg-destructive/10 text-destructive',
              tone === 'warning' && 'bg-warning/10 text-warning',
              tone === 'muted' && 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {titulo}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{count}</span>
              {monto != null && monto > 0 && (
                <span className="text-xs text-muted-foreground">
                  $ {monto.toLocaleString('es-AR')}
                </span>
              )}
            </div>
            {subtitulo && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {subtitulo}
              </div>
            )}
          </div>
          <ArrowRight className="mt-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  )
}

function ShortcutCard({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof FileText
  label: string
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  )
}
