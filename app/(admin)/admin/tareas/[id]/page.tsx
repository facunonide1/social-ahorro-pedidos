import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Layers, Lock, GitBranch, CameraOff } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { adminUsersMap } from '@/lib/admin-hub/users'
import type {
  Tarea,
  TareaComentario,
  TareaHistorialEntry,
  TipoTarea,
} from '@/lib/types/tareas'
import { TAREA_CATEGORIA_LABELS } from '@/lib/constants/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TaskPriorityBadge,
  TaskStatusBadge,
  SlaIndicator,
} from '@/components/tareas/task-badges'
import { WorkflowStepper } from '@/components/tareas/workflow-stepper'
import { TaskExecutionPanel } from '@/components/tareas/task-execution-panel'
import { TaskComments } from '@/components/tareas/task-comments'
import { TaskHistoryTimeline } from '@/components/tareas/task-history-timeline'
import { DependenciasEditor } from '@/components/tareas/dependencias-editor'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export const dynamic = 'force-dynamic'

export default async function TareaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const { data: tarea, error } = await sb
    .from('tareas')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Tarea>()
  if (error || !tarea) notFound()

  const depIds: string[] = Array.isArray((tarea as any).dependencias_ids) ? (tarea as any).dependencias_ids : []

  const [
    { data: tipo },
    { data: comentarios },
    { data: historial },
    usersMap,
    { data: sucursal },
    { data: subtareas },
    { data: depsData },
    { data: candidatosData },
  ] = await Promise.all([
    tarea.tipo_tarea_id
      ? sb
          .from('tipos_tareas')
          .select('*')
          .eq('id', tarea.tipo_tarea_id)
          .maybeSingle<TipoTarea>()
      : Promise.resolve({ data: null }),
    sb
      .from('tareas_comentarios')
      .select('*')
      .eq('tarea_id', tarea.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    sb
      .from('tareas_historial')
      .select('*')
      .eq('tarea_id', tarea.id)
      .order('created_at', { ascending: false })
      .limit(40),
    adminUsersMap(),
    tarea.sucursal_id
      ? sb
          .from('sucursales')
          .select('nombre')
          .eq('id', tarea.sucursal_id)
          .maybeSingle<{ nombre: string }>()
      : Promise.resolve({ data: null }),
    sb
      .from('tareas')
      .select('id, codigo, titulo, estado, prioridad, fecha_vencimiento')
      .eq('tarea_padre_id', tarea.id)
      .order('created_at', { ascending: true }),
    depIds.length > 0
      ? sb.from('tareas').select('id, codigo, titulo, estado').in('id', depIds)
      : Promise.resolve({ data: [] as any[] }),
    tarea.sucursal_id
      ? sb.from('tareas').select('id, codigo, titulo').eq('sucursal_id', tarea.sucursal_id)
          .neq('id', tarea.id).in('estado', ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion'])
          .order('created_at', { ascending: false }).limit(60)
      : sb.from('tareas').select('id, codigo, titulo').neq('id', tarea.id)
          .in('estado', ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion'])
          .order('created_at', { ascending: false }).limit(60),
  ])

  const deps = (depsData ?? []) as { id: string; codigo: string; titulo: string; estado: string }[]
  const candidatos = (candidatosData ?? []) as { id: string; codigo: string; titulo: string }[]
  const bloqueantes = deps.filter((d) => d.estado !== 'completada' && d.estado !== 'descartada')
  const bloqueada = bloqueantes.length > 0
  const puedeEditarDeps =
    profile.rol === 'super_admin' || profile.rol === 'gerente' || (tarea as any).creado_por === profile.id

  function uName(uid: string | null): string {
    if (!uid) return '—'
    const u = usersMap[uid]
    return u?.nombre || u?.email || uid.slice(0, 8)
  }

  // Workflow v2: responsable + supervisor
  const tareaAny = tarea as any
  const esResponsable = tareaAny.responsable_id === profile.id
  const gerencia = profile.rol === 'super_admin' || profile.rol === 'gerente'
  let esSupervisor = gerencia
  if (!esSupervisor && tareaAny.sucursal_id) {
    const { data: sup } = await sb
      .from('supervisores_tareas')
      .select('id')
      .eq('sucursal_id', tareaAny.sucursal_id)
      .eq('user_id', profile.id)
      .eq('activo', true)
      .maybeSingle()
    esSupervisor = Boolean(sup)
  }
  const tipoAny = tipo as any

  return (
    <>
      <PageHeader
        title={tarea.titulo}
        description={`${tarea.codigo}${tipo ? ` · ${tipo.nombre} · ${TAREA_CATEGORIA_LABELS[tipo.categoria]}` : ''}`}
        breadcrumbs={[
          { label: 'Equipo' },
          { label: 'Tareas', href: '/admin/tareas' },
          { label: tarea.codigo },
        ]}
      />

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px] md:p-6">
        {/* Columna izquierda */}
        <div className="space-y-4">
          {bloqueada && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">Tarea bloqueada</div>
                <div className="text-xs">
                  Esperando: {bloqueantes.map((b) => b.titulo).join(' · ')}. Se libera cuando se
                  {bloqueantes.length > 1 ? ' completen todas.' : ' complete.'}
                </div>
              </div>
            </div>
          )}
          {(tarea as any).evidencia_opt_out && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <CameraOff className="size-3.5 shrink-0" />
              Sin evidencia — decisión de {uName((tarea as any).evidencia_opt_out_por)}
            </div>
          )}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge estado={tarea.estado} />
                <TaskPriorityBadge prioridad={tarea.prioridad} />
                <SlaIndicator fechaVencimiento={tarea.fecha_vencimiento} />
              </div>
              <WorkflowStepper
                estado={tarea.estado}
                niveles={(tipo?.niveles_workflow ?? 1) as 1 | 2 | 3}
              />
              <TaskExecutionPanel
                tareaId={tarea.id}
                estado={tarea.estado}
                esResponsable={esResponsable}
                esSupervisor={esSupervisor}
                requeridas={(tareaAny.evidencia_opt_out ? [] : (tipoAny?.evidencia_requerida ?? [])) as string[]}
                checklistItems={(tipoAny?.checklist_items ?? null) as string[] | null}
                verificacionHumana={tareaAny.verificacion_humana !== false}
                preVerificacion={tareaAny.pre_verificacion_ia ?? null}
              />
            </CardContent>
          </Card>

          {tarea.descripcion && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Descripción
                </CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {tarea.descripcion}
              </CardContent>
            </Card>
          )}

          {Object.keys(tarea.datos_custom).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Datos del tipo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(tarea.datos_custom).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="font-medium">{String(v)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tarea.evidencias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Evidencias cargadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {tarea.evidencias.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span className="font-medium">{e.tipo}</span>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Ver
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {subtareas && subtareas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Layers className="size-3.5" />
                  Subtareas ({subtareas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 p-0">
                <ul className="divide-y divide-border">
                  {subtareas.map((s: any) => (
                    <li key={s.id}>
                      <Link
                        href={`/admin/tareas/${s.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent/40"
                      >
                        <span className="truncate">
                          {s.codigo} · {s.titulo}
                        </span>
                        <TaskStatusBadge estado={s.estado} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <GitBranch className="size-3.5" />
                Dependencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DependenciasEditor
                tareaId={tarea.id}
                deps={deps}
                candidates={candidatos}
                canEdit={puedeEditarDeps || esSupervisor}
              />
            </CardContent>
          </Card>

          <TaskComments
            tareaId={tarea.id}
            initial={(comentarios ?? []) as TareaComentario[]}
            users={usersMap}
            currentUserId={profile.id}
          />
        </div>

        {/* Columna derecha */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Responsables
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PersonaRow
                label="Responsable"
                uid={tarea.responsable_id}
                nombre={uName(tarea.responsable_id)}
              />
              {(tipo?.niveles_workflow ?? 1) >= 2 && (
                <PersonaRow
                  label="Verificador"
                  uid={tarea.verificador_id}
                  nombre={uName(tarea.verificador_id)}
                />
              )}
              {(tipo?.niveles_workflow ?? 1) === 3 && (
                <PersonaRow
                  label="Aprobador final"
                  uid={tarea.aprobador_final_id}
                  nombre={uName(tarea.aprobador_final_id)}
                />
              )}
              <PersonaRow
                label="Creado por"
                uid={tarea.creado_por}
                nombre={uName(tarea.creado_por)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Contexto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Sucursal">
                {sucursal?.nombre || 'Sin asignar'}
              </Row>
              <Row label="Departamento">{tarea.departamento || '—'}</Row>
              <Row label="Creada">
                {new Date(tarea.fecha_creacion).toLocaleString('es-AR')}
              </Row>
              {tarea.fecha_vencimiento && (
                <Row label="Vence">
                  {new Date(tarea.fecha_vencimiento).toLocaleString('es-AR')}
                </Row>
              )}
              {tarea.fecha_completada && (
                <Row label="Completada">
                  {new Date(tarea.fecha_completada).toLocaleString('es-AR')}
                </Row>
              )}
              {tarea.tiempo_resolucion_horas != null && (
                <Row label="Tiempo total">
                  {tarea.tiempo_resolucion_horas} h
                </Row>
              )}
              {tarea.puntos_obtenidos != null && (
                <Row label="Puntos">{tarea.puntos_obtenidos}</Row>
              )}
            </CardContent>
          </Card>

          {tarea.entidad_relacionada && tarea.entidad_id && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Entidad vinculada
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div>{tarea.entidad_relacionada}</div>
                {tarea.entidad_url ? (
                  <Link
                    href={tarea.entidad_url}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Abrir
                    <ExternalLink className="size-3" />
                  </Link>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {tarea.entidad_id.slice(0, 8)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <TaskHistoryTimeline
            entries={(historial ?? []) as TareaHistorialEntry[]}
            users={usersMap}
          />
        </aside>
      </div>
    </>
  )
}

function PersonaRow({
  label,
  uid,
  nombre,
}: {
  label: string
  uid: string | null
  nombre: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      {uid ? (
        <EmpleadoAvatar nombre={nombre} size="sm" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm font-medium">
          {uid ? nombre : 'Sin asignar'}
        </div>
      </div>
    </div>
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
