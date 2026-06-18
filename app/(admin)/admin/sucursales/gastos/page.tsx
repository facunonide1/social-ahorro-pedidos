import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import {
  CATEGORIA_GASTO_LABELS,
  type CategoriaGasto,
  type GastoOperativo,
  type Sucursal,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GastosClient } from './client'

export const dynamic = 'force-dynamic'

export default async function GastosOperativosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'tesoreria',
      'sucursal',
      'auditor',
    ],
  })
  const sb = createClient()

  const [{ data: gastoData, error }, { data: sucData }] = await Promise.all([
    sb
      .from('gastos_operativos')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(200),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const gastos = (gastoData ?? []) as GastoOperativo[]
  const sucursales = (sucData ?? []) as Pick<Sucursal, 'id' | 'nombre'>[]
  const canWrite = [
    'super_admin',
    'gerente',
    'administrativo',
    'tesoreria',
    'sucursal',
  ].includes(profile.rol)

  const periodoActual = new Date().toISOString().slice(0, 7)
  const delMes = gastos.filter((g) => g.fecha.slice(0, 7) === periodoActual)
  const totalMes = delMes.reduce((a, g) => a + Number(g.monto), 0)
  const pendientes = gastos.filter((g) => !g.pagado)
  const totalPendiente = pendientes.reduce((a, g) => a + Number(g.monto), 0)

  const porCategoria = new Map<CategoriaGasto, number>()
  for (const g of delMes) {
    porCategoria.set(
      g.categoria,
      (porCategoria.get(g.categoria) || 0) + Number(g.monto),
    )
  }
  const topCategorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <PageHeader
        title="Gastos operativos"
        description="Gastos por sucursal y categoría — alquiler, servicios, mantenimiento y más"
        breadcrumbs={[{ label: 'Sucursales' }, { label: 'Gastos operativos' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración <code>0026_rrhh_caja_gastos.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Gasto del mes"
                value={totalMes}
                format="currency"
              />
              <KpiCard label="Gastos del mes" value={delMes.length} />
              <KpiCard
                label="Pendientes de pago"
                value={pendientes.length}
                variant={pendientes.length > 0 ? 'warning' : 'default'}
              />
              <KpiCard
                label="Monto pendiente"
                value={totalPendiente}
                format="currency"
                variant={totalPendiente > 0 ? 'warning' : 'default'}
              />
            </section>

            {topCategorias.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Gasto del mes por categoría
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topCategorias.map(([cat, monto]) => {
                    const pct = totalMes > 0 ? (monto / totalMes) * 100 : 0
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {CATEGORIA_GASTO_LABELS[cat]}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            $ {monto.toLocaleString('es-AR')} ·{' '}
                            {pct.toFixed(0)}%
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
                </CardContent>
              </Card>
            )}

            <GastosClient
              initial={gastos}
              sucursales={sucursales}
              canWrite={canWrite}
              userId={profile.id}
            />
          </>
        )}
      </div>
    </>
  )
}
