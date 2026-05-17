import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { adminUsersMap } from '@/lib/admin-hub/users'
import type {
  EmpleadoExtended,
  ObjetivoEmpleado,
} from '@/lib/types/empleados'
import type { TareaConTipo } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TaskCard } from '@/components/tareas/task-card'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'
import { ScoreProgress } from '@/components/empleados/score-progress'
import { BadgesGallery } from '@/components/empleados/badge-display'

export const dynamic = 'force-dynamic'

type Tab = 'hoy' | 'objetivos' | 'tareas' | 'badges' | 'legajo'
const TABS: Tab[] = ['hoy', 'objetivos', 'tareas', 'badges', 'legajo']

export default async function MiPanelPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const tab: Tab = TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : 'hoy'

  // Buscamos el empleado vinculado al user logueado.
  const { data: empleadoData } = await sb
    .from('empleados')
    .select('*')
    .eq('user_id', profile.id)
    .maybeSingle<EmpleadoExtended>()

  const empleado = empleadoData ?? null

  // Tareas del usuario logueado (responsable_id).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const mesInicio = new Date()
  mesInicio.setDate(1)
  mesInicio.setHours(0, 0, 0, 0)

  const [
    { data: tareasHoyData },
    { data: tareasAbiertasData },
    completadasMesRes,
    enSlaMesRes,
    usersMap,
    { data: objetivoActual },
  ] = await Promise.all([
    sb
      .from('tareas')
      .select('*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)')
      .eq('responsable_id', profile.id)
      .or(
        `fecha_vencimiento.lt.${tomorrow.toISOString()},and(fecha_vencimiento.is.null,estado.in.(pendiente,asignada,en_progreso))`,
      )
      .not('estado', 'in', '("completada","descartada","rechazada")')
      .order('prioridad', { ascending: false })
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
    sb
      .from('tareas')
      .select('*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)')
      .eq('responsable_id', profile.id)
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion', 'bloqueada'])
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(60),
    sb
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .eq('responsable_id', profile.id)
      .eq('estado', 'completada')
      .gte('fecha_completada', mesInicio.toISOString()),
    sb
      .from('tareas')
      .select('fecha_vencimiento, fecha_completada')
      .eq('responsable_id', profile.id)
      .eq('estado', 'completada')
      .gte('fecha_completada', mesInicio.toISOString()),
    adminUsersMap(),
    empleado
      ? sb
          .from('empleados_objetivos')
          .select('*')
          .eq('empleado_id', empleado.id)
          .eq('estado', 'en_curso')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<ObjetivoEmpleado>()
      : Promise.resolve({ data: null }),
  ])

  const tareasHoy = (tareasHoyData ?? []) as TareaConTipo[]
  const tareasAbiertas = (tareasAbiertasData ?? []) as TareaConTipo[]
  const completadasMes = completadasMesRes.count ?? 0
  const slaRows = (enSlaMesRes.data ?? []) as { fecha_vencimiento: string | null; fecha_completada: string | null }[]
  const conVenc = slaRows.filter((r) => r.fecha_vencimiento && r.fecha_completada)
  const enSla = conVenc.filter((r) =>
    new Date(r.fecha_completada!).getTime() <= new Date(r.fecha_vencimiento!).getTime(),
  ).length
  const pctSla = conVenc.length > 0 ? Math.round((enSla / conVenc.length) * 100) : null

  const nombreCorto =
    empleado?.nombre_completo?.split(' ')[0] ||
    profile.nombre?.split(' ')[0] ||
    profile.email.split('@')[0]

  return (
    <>
      <PageHeader
        title={`Hola, ${nombreCorto}`}
        description="NORA te dejó listo el panel del día"
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Mi panel' }]}
        tabs={TABS.map((t) => ({
          label: TAB_LABELS[t],
          href: `/admin/mi-panel?tab=${t}`,
          active: tab === t,
        }))}
      />

      <div className="space-y-4 p-4 md:p-6">
        {!empleado && (
          <Alert>
            <AlertDescription className="text-xs">
              No estás vinculado a una ficha de empleado todavía. Avisale a RRHH
              para que linkee tu usuario con tu legajo (campo
              <code className="mx-1">empleados.user_id</code>). Mientras tanto
              ves tus tareas asignadas pero no podés ver tus objetivos ni
              badges.
            </AlertDescription>
          </Alert>
        )}

        {/* Hero: avatar + score */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <EmpleadoAvatar
                nombre={empleado?.nombre_completo || profile.email}
                fotoUrl={empleado?.foto_perfil_url ?? null}
                size="xl"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {empleado?.puesto || profile.rol}
                </div>
                <div className="text-xl font-bold leading-tight">
                  {empleado?.nombre_completo || profile.nombre || profile.email}
                </div>
                {empleado?.badges_obtenidos &&
                  empleado.badges_obtenidos.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {empleado.badges_obtenidos.length} badge
                      {empleado.badges_obtenidos.length === 1 ? '' : 's'} ganada
                      {empleado.badges_obtenidos.length === 1 ? '' : 's'}
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
          {empleado && (
            <Card>
              <CardContent className="p-4">
                <ScoreProgress score={empleado.score_total} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* KPI strip */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Tareas para hoy" value={tareasHoy.length} />
          <KpiCard
            label="Completadas este mes"
            value={completadasMes}
            variant="success"
          />
          <KpiCard
            label="% SLA del mes"
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
          <KpiCard label="Score total" value={empleado?.score_total ?? 0} />
        </section>

        {/* Tab content */}
        {tab === 'hoy' && (
          <TabHoy tareas={tareasHoy} usersMap={usersMap} />
        )}
        {tab === 'objetivos' && (
          <TabObjetivos objetivo={objetivoActual ?? null} empleadoVinculado={!!empleado} />
        )}
        {tab === 'tareas' && (
          <TabTareas tareas={tareasAbiertas} usersMap={usersMap} />
        )}
        {tab === 'badges' && empleado && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Mis badges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BadgesGallery obtenidos={empleado.badges_obtenidos} />
            </CardContent>
          </Card>
        )}
        {tab === 'legajo' && (
          <TabLegajo empleado={empleado} email={profile.email} rol={profile.rol} />
        )}
      </div>
    </>
  )
}

const TAB_LABELS: Record<Tab, string> = {
  hoy: 'Hoy',
  objetivos: 'Mis objetivos',
  tareas: 'Mis tareas',
  badges: 'Mis badges',
  legajo: 'Mi legajo',
}

function TabHoy({
  tareas,
  usersMap,
}: {
  tareas: TareaConTipo[]
  usersMap: Record<string, { nombre: string | null; email: string }>
}) {
  if (tareas.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tenés tareas para hoy. Disfrutá el día.
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tareas.map((t) => (
        <TaskCard
          key={t.id}
          tarea={t}
          responsableNombre={
            t.responsable_id ? usersMap[t.responsable_id]?.nombre : null
          }
        />
      ))}
    </div>
  )
}

function TabTareas({
  tareas,
  usersMap,
}: {
  tareas: TareaConTipo[]
  usersMap: Record<string, { nombre: string | null; email: string }>
}) {
  if (tareas.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tenés tareas abiertas asignadas.
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tareas.map((t) => (
        <TaskCard
          key={t.id}
          tarea={t}
          responsableNombre={
            t.responsable_id ? usersMap[t.responsable_id]?.nombre : null
          }
        />
      ))}
    </div>
  )
}

function TabObjetivos({
  objetivo,
  empleadoVinculado,
}: {
  objetivo: ObjetivoEmpleado | null
  empleadoVinculado: boolean
}) {
  if (!empleadoVinculado) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sin ficha de empleado vinculada todavía.
        </CardContent>
      </Card>
    )
  }
  if (!objetivo) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tenés objetivos cargados para este período. RRHH puede crearlos en
          /admin/objetivos.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>
            Objetivos {objetivo.periodo_tipo} · {objetivo.periodo_anio}
            {objetivo.periodo_mes ? `/${String(objetivo.periodo_mes).padStart(2, '0')}` : ''}
          </span>
          {objetivo.score_pct != null && (
            <span className="text-sm font-bold text-foreground tabular-nums">
              {objetivo.score_pct.toFixed(0)}%
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {objetivo.kpis.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Sin KPIs definidos en este objetivo.
          </div>
        )}
        {objetivo.kpis.map((k) => {
          const pct =
            k.meta > 0 ? Math.min(100, Math.round((k.actual / k.meta) * 100)) : 0
          return (
            <div key={k.codigo} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{k.nombre}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatKpi(k.actual, k.unidad)} / {formatKpi(k.meta, k.unidad)} · peso{' '}
                  {k.peso_pct}%
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
}

function formatKpi(v: number, u: string): string {
  if (u === 'monto') return '$ ' + v.toLocaleString('es-AR')
  if (u === 'pct') return `${v}%`
  if (u === 'horas') return `${v} h`
  if (u === 'dias') return `${v} d`
  return v.toLocaleString('es-AR')
}

function TabLegajo({
  empleado,
  email,
  rol,
}: {
  empleado: EmpleadoExtended | null
  email: string
  rol: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Datos personales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Email">{email}</Row>
        <Row label="Rol del sistema">{rol}</Row>
        {empleado && (
          <>
            <Row label="DNI">{empleado.dni || '—'}</Row>
            <Row label="Puesto">{empleado.puesto || '—'}</Row>
            <Row label="Sucursal asignada">
              {empleado.sucursal_id ? empleado.sucursal_id.slice(0, 8) : '—'}
            </Row>
            <Row label="Ingreso">
              {empleado.fecha_ingreso
                ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-AR')
                : '—'}
            </Row>
            <Row label="Nivel de acceso">{empleado.nivel_acceso}</Row>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
