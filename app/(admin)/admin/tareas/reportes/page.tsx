import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { adminUsersMap } from '@/lib/admin-hub/users'
import type { TareaCategoria } from '@/lib/types/tareas'
import { TAREA_CATEGORIA_LABELS } from '@/lib/constants/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const dynamic = 'force-dynamic'

const DIAS_OPCIONES = [7, 30, 90]

export default async function ReportesTareasPage({
  searchParams,
}: {
  searchParams: { dias?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor'],
  })
  const sb = createClient()

  const dias = DIAS_OPCIONES.includes(Number(searchParams.dias))
    ? Number(searchParams.dias)
    : 30
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  desde.setHours(0, 0, 0, 0)

  const { data, error } = await sb
    .from('tareas')
    .select(
      'id, codigo, titulo, estado, prioridad, responsable_id, fecha_creacion, fecha_completada, fecha_vencimiento, tiempo_resolucion_horas, tipo:tipos_tareas(categoria,nombre)',
    )
    .gte('fecha_creacion', desde.toISOString())
    .limit(2000)

  const tareas = (data ?? []) as any[]
  const usersMap = await adminUsersMap()

  const completadas = tareas.filter((t) => t.estado === 'completada')
  const vencidas = tareas.filter((t) => t.estado === 'vencida').length
  const enSlaMuestra = completadas.filter(
    (t) => t.fecha_vencimiento && t.fecha_completada,
  )
  const enSla = enSlaMuestra.filter(
    (t) =>
      new Date(t.fecha_completada).getTime() <=
      new Date(t.fecha_vencimiento).getTime(),
  ).length
  const pctSla =
    enSlaMuestra.length > 0
      ? Math.round((enSla / enSlaMuestra.length) * 100)
      : null

  const tiempos = completadas
    .map((t) => Number(t.tiempo_resolucion_horas || 0))
    .filter((n) => n > 0)
  const tiempoProm =
    tiempos.length > 0
      ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length
      : null

  // Por empleado
  const porEmpleado = new Map<string, { nombre: string; total: number; completadas: number }>()
  for (const t of tareas) {
    if (!t.responsable_id) continue
    const cur =
      porEmpleado.get(t.responsable_id) ?? {
        nombre:
          usersMap[t.responsable_id]?.nombre ||
          usersMap[t.responsable_id]?.email ||
          t.responsable_id.slice(0, 8),
        total: 0,
        completadas: 0,
      }
    cur.total++
    if (t.estado === 'completada') cur.completadas++
    porEmpleado.set(t.responsable_id, cur)
  }
  const rankingEmpleados = [...porEmpleado.values()]
    .sort((a, b) => b.completadas - a.completadas)
    .slice(0, 12)
  const maxCompletadas = Math.max(...rankingEmpleados.map((r) => r.completadas), 1)

  // Por categoría
  const porCategoria: Record<string, number> = {}
  for (const t of tareas) {
    const cat =
      (Array.isArray(t.tipo) ? t.tipo[0]?.categoria : t.tipo?.categoria) ??
      'otro'
    porCategoria[cat] = (porCategoria[cat] || 0) + 1
  }

  // Serie diaria (completadas vs creadas)
  const serieDias: Record<string, { creadas: number; completadas: number }> = {}
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    serieDias[d.toISOString().slice(0, 10)] = { creadas: 0, completadas: 0 }
  }
  for (const t of tareas) {
    const dc = t.fecha_creacion?.slice(0, 10)
    if (dc && serieDias[dc]) serieDias[dc].creadas++
    if (t.estado === 'completada' && t.fecha_completada) {
      const dx = t.fecha_completada.slice(0, 10)
      if (serieDias[dx]) serieDias[dx].completadas++
    }
  }
  const serieArr = Object.entries(serieDias)
  const maxSerie = Math.max(
    ...serieArr.map(([, v]) => Math.max(v.creadas, v.completadas)),
    1,
  )

  return (
    <>
      <PageHeader
        title="Reportes de tareas"
        description={`Análisis de los últimos ${dias} días`}
        breadcrumbs={[
          { label: 'Equipo' },
          { label: 'Tareas', href: '/admin/tareas' },
          { label: 'Reportes' },
        ]}
        tabs={DIAS_OPCIONES.map((d) => ({
          label: `Últimos ${d}d`,
          href: `/admin/tareas/reportes?dias=${d}`,
          active: dias === d,
        }))}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Total" value={tareas.length} />
          <KpiCard
            label="Completadas"
            value={completadas.length}
            variant="success"
          />
          <KpiCard
            label="Vencidas"
            value={vencidas}
            variant={vencidas > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="% SLA"
            value={pctSla}
            format="percent"
            variant={
              pctSla == null
                ? 'default'
                : pctSla >= 90
                  ? 'success'
                  : pctSla >= 70
                    ? 'warning'
                    : 'danger'
            }
          />
          <KpiCard
            label="Tiempo prom. (h)"
            value={tiempoProm != null ? Math.round(tiempoProm * 10) / 10 : null}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tendencia diaria (creadas vs completadas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {serieArr.map(([fecha, v]) => {
                const hCreadas = (v.creadas / maxSerie) * 100
                const hCompl = (v.completadas / maxSerie) * 100
                return (
                  <div
                    key={fecha}
                    className="group relative flex h-full flex-1 flex-col justify-end gap-0.5"
                    title={`${fecha}: ${v.creadas} creadas · ${v.completadas} completadas`}
                  >
                    <div
                      className="w-full rounded-sm bg-primary/40 group-hover:bg-primary/80"
                      style={{ height: `${Math.max(hCreadas, 1)}%` }}
                    />
                    <div
                      className="w-full rounded-sm bg-success/60 group-hover:bg-success"
                      style={{ height: `${Math.max(hCompl, 1)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{serieArr[0]?.[0]}</span>
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-primary/60" /> creadas
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-success" /> completadas
                </span>
              </span>
              <span>{serieArr[serieArr.length - 1]?.[0]}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Top responsables
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rankingEmpleados.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sin datos.</div>
              ) : (
                rankingEmpleados.map((r) => {
                  const pct = (r.completadas / maxCompletadas) * 100
                  return (
                    <div key={r.nombre} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{r.nombre}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.completadas}/{r.total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Distribución por categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.keys(porCategoria).length === 0 ? (
                <div className="text-xs text-muted-foreground">Sin datos.</div>
              ) : (
                Object.entries(porCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => {
                    const pct = (n / tareas.length) * 100
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {TAREA_CATEGORIA_LABELS[cat as TareaCategoria] ?? cat}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {n} · {pct.toFixed(0)}%
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
                  })
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          Export a CSV/Excel queda como mejora futura. Por ahora podés copiar
          datos directo desde la tabla con Cmd+A / Ctrl+A.
        </p>
      </div>
    </>
  )
}
