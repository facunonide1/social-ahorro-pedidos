import { Trophy } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { EmpleadoExtended } from '@/lib/types/empleados'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export const dynamic = 'force-dynamic'

type Tab = 'global' | 'sucursal' | 'mes'
const TABS: Tab[] = ['global', 'sucursal', 'mes']
const TAB_LABELS: Record<Tab, string> = {
  global: 'Global',
  sucursal: 'Mi sucursal',
  mes: 'Top del mes',
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const tab: Tab = TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : 'global'

  let q = sb
    .from('empleados')
    .select('*')
    .eq('activo', true)
    .order('score_total', { ascending: false })
    .limit(50)
  if (tab === 'sucursal' && profile.sucursal_id) {
    q = q.eq('sucursal_id', profile.sucursal_id)
  }

  // Para "mes" usamos puntos del mes — proxy: tareas completadas este mes * puntos
  // del tipo. Por simplicidad v1, ordenamos por score_total (lifetime) y mostramos
  // un disclaimer abajo.
  const { data, error } = await q
  const empleados = (data ?? []) as EmpleadoExtended[]
  const totalScore = empleados.reduce((a, e) => a + Number(e.score_total || 0), 0)

  return (
    <>
      <PageHeader
        title="Ranking"
        description="Top performers de Social Ahorro · puntos por tareas completadas y badges ganados"
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Ranking' }]}
        tabs={TABS.map((t) => ({
          label: TAB_LABELS[t],
          href: `/admin/ranking?tab=${t}`,
          active: tab === t,
        }))}
      />

      <div className="space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="Empleados en el ranking" value={empleados.length} />
          <KpiCard label="Puntos totales" value={totalScore} />
          <KpiCard
            label="Top score"
            value={empleados[0]?.score_total ?? 0}
            variant="success"
          />
        </section>

        {error && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-destructive">
              {error.message}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Trophy className="size-3.5" />
              {TAB_LABELS[tab]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {empleados.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Sin datos en este ranking.
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {empleados.map((e, i) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <RankingMedalla pos={i + 1} />
                    <EmpleadoAvatar
                      nombre={e.nombre_completo}
                      fotoUrl={e.foto_perfil_url}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {e.nombre_completo}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{e.puesto || '—'}</span>
                        {e.badges_obtenidos.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {e.badges_obtenidos.length} badge
                            {e.badges_obtenidos.length === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold tabular-nums">
                        {e.score_total.toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        pts
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          El score lifetime se calcula al cerrar cada tarea (puntos del tipo +
          bonus de badges ganados). El ranking "Top del mes" mostrará puntos del
          período actual cuando esté listo el cron de calcular-objetivos.
        </p>
      </div>
    </>
  )
}

function RankingMedalla({ pos }: { pos: number }) {
  if (pos > 3) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
        {pos}
      </span>
    )
  }
  const colors: Record<number, string> = {
    1: 'bg-amber-400 text-amber-900',
    2: 'bg-zinc-300 text-zinc-800',
    3: 'bg-amber-700 text-white',
  }
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow ${colors[pos]}`}
    >
      {pos}
    </span>
  )
}
