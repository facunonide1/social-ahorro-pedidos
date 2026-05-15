import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CATEGORIA_GASTO_LABELS } from '@/lib/types/admin'
import { STATUS_LABELS, TIPO_ENVIO_LABELS } from '@/lib/types'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const DIAS_VENTAS = 30

function isoDaysAgo(d: number): string {
  const x = new Date()
  x.setDate(x.getDate() - d)
  return x.toISOString()
}

function dateKey(iso: string): string {
  return iso.slice(0, 10)
}

export default async function BIPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor'],
  })
  const sb = createClient()
  const periodoActual = new Date().toISOString().slice(0, 7)

  const [ordersRes, gastosRes, facturasRes] = await Promise.all([
    sb
      .from('orders')
      .select('total, status, tipo_envio, created_at')
      .gte('created_at', isoDaysAgo(DIAS_VENTAS)),
    sb.from('gastos_operativos').select('monto, categoria').eq('periodo', periodoActual),
    sb
      .from('facturas_proveedor')
      .select('total, estado, proveedores(razon_social)')
      .not('estado', 'in', '("pagada","anulada","rechazada")'),
  ])

  const orders = (ordersRes.data ?? []) as any[]
  const validas = orders.filter((o) => o.status !== 'cancelado')
  const facturacion = validas.reduce((a, o) => a + Number(o.total || 0), 0)

  // Serie diaria
  const dias: Record<string, number> = {}
  for (let i = DIAS_VENTAS - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dias[d.toISOString().slice(0, 10)] = 0
  }
  for (const o of validas) {
    const k = dateKey(o.created_at)
    if (k in dias) dias[k] += Number(o.total || 0)
  }
  const serie = Object.entries(dias)
  const maxDia = Math.max(...serie.map(([, v]) => v), 1)

  // Por estado / tipo
  const porEstado: Record<string, number> = {}
  const porTipoEnvio: Record<string, number> = {}
  for (const o of orders) {
    porEstado[o.status] = (porEstado[o.status] || 0) + 1
    porTipoEnvio[o.tipo_envio] = (porTipoEnvio[o.tipo_envio] || 0) + 1
  }

  // Gastos por categoría
  const porCategoria: Record<string, number> = {}
  for (const g of (gastosRes.data ?? []) as any[]) {
    porCategoria[g.categoria] =
      (porCategoria[g.categoria] || 0) + Number(g.monto || 0)
  }
  const totalGastoMes = Object.values(porCategoria).reduce((a, x) => a + x, 0)

  // Top proveedores por monto adeudado
  const adeudo: Record<string, number> = {}
  for (const f of (facturasRes.data ?? []) as any[]) {
    const prov =
      (Array.isArray(f.proveedores) ? f.proveedores[0] : f.proveedores)
        ?.razon_social ?? '—'
    adeudo[prov] = (adeudo[prov] || 0) + Number(f.total || 0)
  }
  const topAdeudo = Object.entries(adeudo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const totalAdeudo = Object.values(adeudo).reduce((a, x) => a + x, 0)

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="BI"
        description={`Tendencias y distribución de los últimos ${DIAS_VENTAS} días.`}
        breadcrumbs={[{ label: 'BI' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={`Facturación ${DIAS_VENTAS}d`}
            value={facturacion}
            format="currency"
          />
          <KpiCard label="Pedidos no cancelados" value={validas.length} />
          <KpiCard
            label="Ticket promedio"
            value={validas.length > 0 ? facturacion / validas.length : 0}
            format="currency"
          />
          <KpiCard
            label="Adeudado a proveedores"
            value={totalAdeudo}
            format="currency"
            variant={totalAdeudo > 0 ? 'warning' : 'default'}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Facturación diaria · últimos {DIAS_VENTAS} días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {serie.map(([fecha, monto]) => {
                const altura = (monto / maxDia) * 100
                return (
                  <div
                    key={fecha}
                    className="group relative flex h-full flex-1 items-end"
                    title={`${fecha}: $ ${monto.toLocaleString('es-AR')}`}
                  >
                    <div
                      className="w-full rounded-sm bg-primary/30 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max(altura, 1)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{serie[0]?.[0]}</span>
              <span>{serie[serie.length - 1]?.[0]}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pedidos por estado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Distribucion
                data={porEstado}
                labels={STATUS_LABELS as Record<string, string>}
                total={orders.length}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pedidos por tipo de envío
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Distribucion
                data={porTipoEnvio}
                labels={TIPO_ENVIO_LABELS as Record<string, string>}
                total={orders.length}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Gasto del mes por categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Distribucion
                data={porCategoria}
                labels={CATEGORIA_GASTO_LABELS as Record<string, string>}
                total={totalGastoMes}
                format="currency"
              />
              {totalGastoMes === 0 && (
                <div className="text-xs text-muted-foreground">
                  Sin gastos cargados este mes.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Top proveedores por monto adeudado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topAdeudo.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Sin facturas pendientes.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {topAdeudo.map(([prov, monto]) => (
                    <li
                      key={prov}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    >
                      <span className="truncate">{prov}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        $ {monto.toLocaleString('es-AR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </HubShell>
  )
}

function Distribucion({
  data,
  labels,
  total,
  format,
}: {
  data: Record<string, number>
  labels: Record<string, string>
  total: number
  format?: 'currency'
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  if (entries.length === 0)
    return (
      <div className="text-xs text-muted-foreground">Sin datos en el período.</div>
    )
  return (
    <>
      {entries.map(([k, v]) => {
        const pct = total > 0 ? (v / total) * 100 : 0
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{labels[k] ?? k}</span>
              <span className="tabular-nums text-muted-foreground">
                {format === 'currency'
                  ? '$ ' + v.toLocaleString('es-AR')
                  : v}{' '}
                · {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </>
  )
}
