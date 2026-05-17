import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Layers } from 'lucide-react'

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
import { TaskQuickActions } from '@/components/tareas/task-quick-actions'
import { TaskComments } from '@/components/tareas/task-comments'
import { TaskHistoryTimeline } from '@/components/tareas/task-history-timeline'
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

  const [
    { data: tipo },
    { data: comentarios },
    { data: historial },
    usersMap,
    { data: sucursal },
    { data: subtareas },
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
  ])

  function uName(uid: string | null): string {
    if (!uid) return '—'
    const u = usersMap[uid]
    return u?.nombre || u?.email || uid.slice(0, 8)
  }

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
              <TaskQuickActions
                tarea={tarea}
                tipo={tipo ?? null}
                currentUserId={profile.id}
                currentUserRol={profile.rol}
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
