import Link from 'next/link'
import { ShoppingCart, AlertTriangle, DollarSign, TrendingDown, Truck, FileText, PackageCheck, Undo2, Scale, Megaphone, ArrowRight } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { AccionesSector } from '@/components/shared/acciones-sector'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { RecomendacionesComprasCard } from '@/components/compras/recomendaciones-card'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compras' }

const ABIERTAS = ['borrador', 'enviada', 'confirmada', 'recibida_parcial']

export default async function ComprasTablero({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)
  const { sucursalId, esTodas } = getSucursalActiva()
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01'

  let ocQ = sb.from('ordenes_compra').select('id, total_estimado, estado, rubro, created_at').limit(2000)
  if (rubro !== 'todos') ocQ = ocQ.eq('rubro', rubro)
  if (!esTodas && sucursalId) ocQ = ocQ.eq('sucursal_compradora_id', sucursalId)
  let afQ = sb.from('avisos_faltante').select('id, estado, rubro').eq('estado', 'nuevo').limit(2000)
  if (rubro !== 'todos') afQ = afQ.eq('rubro', rubro)
  if (!esTodas && sucursalId) afQ = afQ.eq('sucursal_id', sucursalId)
  let provQ = sb.from('proveedores').select('id, razon_social, rubros, score_actual, es_drogueria').eq('activo', true).order('razon_social').limit(500)

  const [{ data: ocs }, { data: avisos }, { data: provs }] = await Promise.all([ocQ, afQ, provQ])

  const ordenes = (ocs ?? []) as any[]
  const abiertas = ordenes.filter((o) => ABIERTAS.includes(o.estado)).length
  const compradoMes = ordenes.filter((o) => o.created_at >= inicioMes).reduce((a, o) => a + Number(o.total_estimado ?? 0), 0)
  const faltantes = (avisos ?? []).length
  const proveedores = ((provs ?? []) as any[]).filter((p) => rubro === 'todos' || (p.rubros ?? []).includes(rubro))

  return (
    <>
      <PageHeader title="Compras" description="Sistema de compras multisucursal conectado a stock, ventas y finanzas."
        breadcrumbs={[{ label: 'Compras' }]} />
      <div className="space-y-5 p-4 md:p-6">
        <AccionesSector sector="compras" />
        <RubroFilter />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Órdenes abiertas" value={abiertas} icon={ShoppingCart} href="/admin/compras/ordenes" />
          <KpiCard label="Faltantes sin resolver" value={faltantes} icon={AlertTriangle} variant={faltantes > 0 ? 'warning' : 'default'} href="/admin/compras/faltantes" />
          <KpiCard label="Comprado este mes" value={compradoMes} format="currency" icon={DollarSign} />
          <KpiCard label="Ahorro detectado" value={0} format="currency" icon={TrendingDown} footer="Comparador" href="/admin/compras/comparador" />
        </section>

        <NoraCard contexto="compras">
          {faltantes > 0
            ? <p>Hay <b>{faltantes}</b> faltantes reportados por las sucursales{rubro !== 'todos' ? ` en ${rubro}` : ''}. Cruzalos con el análisis de reposición de Operaciones y armá las órdenes. <Link href="/admin/compras/faltantes" className="text-primary hover:underline">Ver faltantes →</Link></p>
            : <p>Sin faltantes pendientes. Revisá la sugerencia de reposición de Operaciones para adelantarte a los quiebres.</p>}
        </NoraCard>

        <RecomendacionesComprasCard sucursalId={sucursalId} esTodas={esTodas} />

        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Accesos rápidos</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {[
              { l: 'Avisos de faltantes', h: '/admin/compras/faltantes', i: AlertTriangle },
              { l: 'Órdenes de compra', h: '/admin/compras/ordenes', i: ShoppingCart },
              { l: 'Comparador de precios', h: '/admin/compras/comparador', i: Scale },
              { l: 'Recepciones', h: '/admin/compras/recepciones', i: PackageCheck },
              { l: 'Devoluciones', h: '/admin/compras/devoluciones', i: Undo2 },
              { l: 'Proveedores', h: '/admin/proveedores', i: Truck },
            ].map((a) => (
              <Link key={a.h} href={a.h} className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:scale-[1.02] hover:border-primary/50 hover:shadow-md">
                <div className="flex items-center justify-between"><a.i className="size-5 text-primary" /><ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
                <div className="text-sm font-medium">{a.l}</div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Proveedores por rubro {rubro !== 'todos' && <span className="text-muted-foreground">· {rubro}</span>}</h2>
          {proveedores.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin proveedores en este rubro. Cargá el demo o creá proveedores.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Rubros</th><th className="px-3 py-2 text-right">Score</th></tr></thead>
                <tbody>
                  {proveedores.slice(0, 30).map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-1.5"><Link href={`/admin/proveedores/${p.id}`} className="font-medium hover:underline">{p.razon_social}</Link>{p.es_drogueria && <span className="ml-2 text-[10px] text-muted-foreground">droguería</span>}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{(p.rubros ?? []).join(', ') || '—'}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', p.score_actual != null && p.score_actual < 6 && 'text-rose-600 dark:text-rose-400')}>{p.score_actual != null ? `${p.score_actual}/10` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
