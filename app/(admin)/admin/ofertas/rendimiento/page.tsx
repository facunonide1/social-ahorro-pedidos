import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { NoraCard } from '@/components/nora/nora-card'
import { Badge } from '@/components/ui/badge'
import { RendimientoExport, type RendRow } from './rendimiento-client'
import { TIPO_LABEL } from '../ofertas-client'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rendimiento de ofertas' }

export default async function RendimientoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: ofertas }, { data: aprend }] = await Promise.all([
    sb.from('ofertas').select('id, codigo, nombre, tipo, estado, metricas').eq('estado', 'finalizada').limit(500),
    sb.from('ofertas_aprendizaje').select('tipo_oferta, rubro, uplift_promedio, n_casos').order('uplift_promedio', { ascending: false }),
  ])

  const rows: RendRow[] = ((ofertas ?? []) as any[]).map((o) => ({
    id: o.id, codigo: o.codigo, nombre: o.nombre, tipo: o.tipo,
    uplift: Number(o.metricas?.uplift_pct ?? 0), unidades: Number(o.metricas?.unidades ?? 0),
    rentabilidad: Number(o.metricas?.rentabilidad ?? 0), mejorSucursal: o.metricas?.mejor_sucursal ?? '—',
  })).sort((a, b) => b.uplift - a.uplift)

  const aprendizaje = (aprend ?? []) as any[]
  const mejorTipo = aprendizaje[0]

  return (
    <>
      <PageHeader title="Rendimiento de ofertas" description="Uplift, rentabilidad y qué tipo de oferta rinde mejor. NORA aprende de esto."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Rendimiento' }]} />
      <div className="space-y-5 p-4 md:p-6">
        <NoraCard contexto="aprendizaje de ofertas">
          {mejorTipo
            ? <p>Aprendizaje: los <b>{TIPO_LABEL[mejorTipo.tipo_oferta] ?? mejorTipo.tipo_oferta}</b> rinden mejor (uplift promedio <b>{Number(mejorTipo.uplift_promedio).toFixed(0)}%</b> en {mejorTipo.n_casos} casos). Priorizo ese tipo en mis propuestas.</p>
            : <p>Todavía no hay suficientes ofertas finalizadas para aprender. Cuando finalicen, comparo el uplift por tipo (2x1 vs %off vs combo) y ajusto mis propuestas.</p>}
        </NoraCard>

        <section>
          <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">Ranking por uplift</h2><RendimientoExport rows={rows} /></div>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Sin ofertas finalizadas con métricas todavía.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Oferta</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Uplift</th><th className="px-3 py-2 text-right">Unidades</th><th className="px-3 py-2 text-right">Rentab. est.</th><th className="px-3 py-2">Mejor sucursal</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-medium">{r.nombre}</td>
                      <td className="px-3 py-1.5 text-xs">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums font-medium', r.uplift > 0 ? 'text-emerald-600 dark:text-emerald-400' : '')}>+{r.uplift}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.unidades}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">$ {r.rentabilidad.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.mejorSucursal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Comparación por tipo (aprendizaje)</h2>
          {aprendizaje.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin datos de aprendizaje aún.</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {aprendizaje.map((a, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{TIPO_LABEL[a.tipo_oferta] ?? a.tipo_oferta}</span>{i === 0 && <Badge variant="success" className="font-normal">mejor</Badge>}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{Number(a.uplift_promedio).toFixed(0)}%</div>
                  <div className="text-[11px] text-muted-foreground">{a.n_casos} casos · {a.rubro ?? 'todos'}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
