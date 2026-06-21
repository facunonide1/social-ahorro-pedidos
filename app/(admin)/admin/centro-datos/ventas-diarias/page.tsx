import Link from 'next/link'
import { Upload, ShoppingBag, TrendingUp, Package, CalendarDays } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { VentasDiariasClient } from './ventas-diarias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ventas diarias · Centro de Datos' }

function fmt(n: number) { return n.toLocaleString('es-AR') }
function isoDays(ago: number) { return new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10) }

export default async function VentasDiariasPage({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const desde = searchParams.desde ?? isoDays(7)
  const hasta = searchParams.hasta ?? isoDays(0)
  const p_suc = esTodas ? null : sucursalId

  const [{ data: resumen }, { data: ranking }, { data: totales }, { data: perfilVentas }] = await Promise.all([
    sb.rpc('cd_resumen_ventas', { p_sucursal: p_suc, p_desde: desde, p_hasta: hasta }),
    sb.rpc('cd_ranking_vendidos', { p_sucursal: p_suc, p_desde: desde, p_hasta: hasta, p_limit: 50 }),
    sb.rpc('cd_totales_sucursal', { p_desde: desde, p_hasta: hasta }),
    sb.from('perfiles_datos').select('id').eq('tipo', 'ventas').eq('direccion', 'import').eq('es_sistema', true).limit(1).maybeSingle(),
  ])

  const r = (resumen?.[0] ?? { unidades: 0, monto: 0, productos: 0, lineas: 0, dias: 0 }) as any
  const rank = (ranking ?? []) as any[]
  const comp = (totales ?? []) as any[]
  const perfilId = (perfilVentas as any)?.id ?? null

  const cargarHref = perfilId ? `/admin/centro-datos/importar?perfil=${perfilId}` : '/admin/centro-datos/importar'

  return (
    <>
      <PageHeader title="Ventas diarias" description="La fuente fina de ventas por sucursal. Alimenta análisis de compra y reportes."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Ventas diarias' }]}
        actions={<Button asChild size="sm"><Link href={cargarHref}><Upload className="size-4" /> Cargar ventas del día</Link></Button>} />

      <div className="space-y-5 p-4 md:p-6">
        <VentasDiariasClient desde={desde} hasta={hasta} ranking={rank} comparativa={comp} esTodas={esTodas} />

        {r.lineas === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
            <ShoppingBag className="size-7 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">No hay ventas cargadas en este período.</div>
            <Button asChild size="sm"><Link href={cargarHref}><Upload className="size-4" /> Cargar ventas del día</Link></Button>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi icon={Package} label="Unidades vendidas" value={fmt(Math.round(r.unidades))} />
              <Kpi icon={TrendingUp} label="Facturado" value={`$${fmt(Math.round(r.monto))}`} />
              <Kpi icon={ShoppingBag} label="Productos distintos" value={fmt(r.productos)} />
              <Kpi icon={CalendarDays} label="Días con datos" value={fmt(r.dias)} />
            </div>

            {/* Comparativa entre sucursales (solo en consolidado) */}
            {esTodas && comp.length > 1 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 text-sm font-medium">Comparativa entre sucursales</div>
                <div className="space-y-2">
                  {comp.map((c) => {
                    const max = Math.max(...comp.map((x) => Number(x.monto) || 0), 1)
                    const pct = Math.round(((Number(c.monto) || 0) / max) * 100)
                    return (
                      <div key={c.sucursal_id}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="text-muted-foreground">${fmt(Math.round(c.monto))} · {fmt(Math.round(c.unidades))} u.</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}
