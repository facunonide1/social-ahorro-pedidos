import { Target } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { EmpleadoExtended, ObjetivoEmpleado } from '@/lib/types/empleados'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export const dynamic = 'force-dynamic'

export default async function ObjetivosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const [{ data: objetivosData, error }, { data: empleadosData }] =
    await Promise.all([
      sb
        .from('empleados_objetivos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      sb.from('empleados').select('*').eq('activo', true),
    ])

  const objetivos = (objetivosData ?? []) as ObjetivoEmpleado[]
  const empleados = (empleadosData ?? []) as EmpleadoExtended[]
  const empById = new Map(empleados.map((e) => [e.id, e]))

  const enCurso = objetivos.filter((o) => o.estado === 'en_curso')
  const cerrados = objetivos.filter((o) => o.estado === 'cerrado')
  const scoreProm =
    cerrados.length > 0
      ? cerrados.reduce((a, o) => a + (Number(o.score_pct) || 0), 0) /
        cerrados.length
      : null

  return (
    <>
      <PageHeader
        title="Objetivos del equipo"
        description="KPIs ponderados por empleado y período · revisión y seguimiento."
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Objetivos' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Objetivos en curso" value={enCurso.length} />
          <KpiCard label="Cerrados" value={cerrados.length} />
          <KpiCard label="Empleados con objetivo" value={
            new Set(enCurso.map((o) => o.empleado_id)).size
          } />
          <KpiCard
            label="Score promedio (cerrados)"
            value={scoreProm}
            format="percent"
            variant={scoreProm == null ? 'default' : scoreProm >= 80 ? 'success' : 'warning'}
          />
        </section>

        {objetivos.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Target className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Todavía no hay objetivos cargados. NORA y los managers pueden
                crearlos asignando KPIs ponderados desde acá.
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {enCurso.map((o) => {
            const emp = empById.get(o.empleado_id)
            return (
              <Card key={o.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-center gap-3">
                    {emp && (
                      <EmpleadoAvatar
                        nombre={emp.nombre_completo}
                        fotoUrl={emp.foto_perfil_url}
                        size="md"
                      />
                    )}
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {emp?.nombre_completo || o.empleado_id.slice(0, 8)}
                      </CardTitle>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {o.periodo_tipo} · {o.periodo_anio}
                        {o.periodo_mes
                          ? `/${String(o.periodo_mes).padStart(2, '0')}`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={
                      o.score_pct == null
                        ? 'outline'
                        : o.score_pct >= 80
                          ? 'success'
                          : o.score_pct >= 50
                            ? 'warning'
                            : 'destructive'
                    }
                    className="text-xs"
                  >
                    {o.score_pct != null ? `${o.score_pct.toFixed(0)}%` : 'Sin score'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {o.kpis.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      Sin KPIs configurados.
                    </div>
                  )}
                  {o.kpis.map((k) => {
                    const pct =
                      k.meta > 0
                        ? Math.min(100, Math.round((k.actual / k.meta) * 100))
                        : 0
                    return (
                      <div key={k.codigo} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{k.nombre}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {k.actual} / {k.meta} · {k.peso_pct}%
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
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          La alta de objetivos por bulk + el cierre nightly de KPIs se manejan
          desde un cron en F6.15. Mientras tanto, los objetivos se pueden
          cargar directo desde SQL o desde NORA con la tool correspondiente.
        </p>
      </div>
    </>
  )
}
