import Link from 'next/link'
import { ArrowRight, Trophy, UsersRound } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { adminUsersMap } from '@/lib/admin-hub/users'
import type { EmpleadoExtended } from '@/lib/types/empleados'
import type { TareaConTipo } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TaskCard } from '@/components/tareas/task-card'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export const dynamic = 'force-dynamic'

type Tab = 'equipo' | 'tareas' | 'aprobaciones' | 'ranking'
const TABS: Tab[] = ['equipo', 'tareas', 'aprobaciones', 'ranking']
const TAB_LABELS: Record<Tab, string> = {
  equipo: 'Mi equipo',
  tareas: 'Tareas del equipo',
  aprobaciones: 'Por verificar',
  ranking: 'Ranking',
}

const ROLES_TRANSV = ['super_admin', 'gerente', 'auditor']

export default async function MiEquipoPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'sucursal', 'administrativo', 'auditor'],
  })
  const sb = createClient()
  const tab: Tab = TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : 'equipo'

  const verTodos = ROLES_TRANSV.includes(profile.rol)

  // Empleados del equipo
  let qEmp = sb
    .from('empleados')
    .select('*')
    .eq('activo', true)
    .order('score_total', { ascending: false })
  if (!verTodos && profile.sucursal_id) {
    qEmp = qEmp.eq('sucursal_id', profile.sucursal_id)
  } else if (!verTodos) {
    // Sin sucursal asignada y sin rol transversal → solo sus reportes directos.
    qEmp = qEmp.eq('supervisor_id', profile.id)
  }
  const { data: empleadosData } = await qEmp.limit(60)
  const empleados = (empleadosData ?? []) as EmpleadoExtended[]
  const empleadoUserIds = empleados.map((e) => e.user_id).filter(Boolean) as string[]

  // Tareas del equipo
  let qTareas = sb
    .from('tareas')
    .select(
      '*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)',
    )
    .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion', 'bloqueada'])
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    .limit(120)
  if (!verTodos && profile.sucursal_id) {
    qTareas = qTareas.eq('sucursal_id', profile.sucursal_id)
  } else if (!verTodos && empleadoUserIds.length > 0) {
    qTareas = qTareas.in('responsable_id', empleadoUserIds)
  }
  const { data: tareasEquipoData } = await qTareas
  const tareasEquipo = (tareasEquipoData ?? []) as TareaConTipo[]

  // Por verificar mías
  const { data: porVerificarData } = await sb
    .from('tareas')
    .select(
      '*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)',
    )
    .eq('verificador_id', profile.id)
    .eq('estado', 'en_verificacion')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
  const porVerificar = (porVerificarData ?? []) as TareaConTipo[]

  const usersMap = await adminUsersMap()

  const tareasVencidas = tareasEquipo.filter((t) => t.estado === 'vencida').length
  const tareasCriticas = tareasEquipo.filter(
    (t) => t.prioridad === 'critica' && t.estado !== 'completada',
  ).length

  return (
    <>
      <PageHeader
        title="Mi equipo"
        description={
          verTodos
            ? 'Vista global del equipo de toda la cadena'
            : profile.sucursal_id
              ? 'Tu sucursal · empleados, tareas y aprobaciones'
              : 'Tus reportes directos'
        }
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Mi equipo' }]}
        tabs={TABS.map((t) => ({
          label: TAB_LABELS[t],
          href: `/admin/mi-equipo?tab=${t}`,
          active: tab === t,
          badge:
            t === 'equipo'
              ? empleados.length
              : t === 'tareas'
                ? tareasEquipo.length
                : t === 'aprobaciones'
                  ? porVerificar.length
                  : undefined,
        }))}
      />

      <div className="space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Empleados activos" value={empleados.length} />
          <KpiCard
            label="Tareas en curso"
            value={tareasEquipo.length}
          />
          <KpiCard
            label="Críticas abiertas"
            value={tareasCriticas}
            variant={tareasCriticas > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Vencidas"
            value={tareasVencidas}
            variant={tareasVencidas > 0 ? 'warning' : 'default'}
          />
        </section>

        {tab === 'equipo' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {empleados.length === 0 ? (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  <UsersRound className="mx-auto mb-2 size-8 text-muted-foreground/50" />
                  No hay empleados en tu equipo.
                </CardContent>
              </Card>
            ) : (
              empleados.map((e) => {
                // Carga aproximada: cuento tareas abiertas del empleado en la lista.
                const tareasDelEmp = e.user_id
                  ? tareasEquipo.filter((t) => t.responsable_id === e.user_id)
                  : []
                const venc = tareasDelEmp.filter((t) => t.estado === 'vencida').length
                return (
                  <Card key={e.id} className="transition-colors hover:border-primary/40">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <EmpleadoAvatar
                          nombre={e.nombre_completo}
                          fotoUrl={e.foto_perfil_url}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {e.nombre_completo}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {e.puesto || '—'}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px]">
                            <Badge variant="outline" className="text-[10px]">
                              {tareasDelEmp.length} tareas
                            </Badge>
                            {venc > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                {venc} vencida{venc === 1 ? '' : 's'}
                              </Badge>
                            )}
                            {e.score_total > 0 && (
                              <span className="text-muted-foreground">
                                {e.score_total} pts
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {tab === 'tareas' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tareasEquipo.length === 0 ? (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Sin tareas abiertas en el equipo.
                </CardContent>
              </Card>
            ) : (
              tareasEquipo.map((t) => (
                <TaskCard
                  key={t.id}
                  tarea={t}
                  responsableNombre={
                    t.responsable_id ? usersMap[t.responsable_id]?.nombre : null
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === 'aprobaciones' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {porVerificar.length === 0 ? (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No tenés tareas pendientes de verificar.
                </CardContent>
              </Card>
            ) : (
              porVerificar.map((t) => (
                <TaskCard
                  key={t.id}
                  tarea={t}
                  responsableNombre={
                    t.responsable_id ? usersMap[t.responsable_id]?.nombre : null
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === 'ranking' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Trophy className="size-3.5" />
                Top performers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="divide-y divide-border">
                {empleados.slice(0, 20).map((e, i) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <EmpleadoAvatar
                      nombre={e.nombre_completo}
                      fotoUrl={e.foto_perfil_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {e.nombre_completo}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {e.puesto || '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">
                        {e.score_total.toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        pts
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-t border-border px-4 py-2 text-right">
                <Link
                  href="/admin/ranking"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Ver ranking completo
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
