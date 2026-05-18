/**
 * Generación de notificaciones para el sistema de tareas (F6.17).
 * Inserta en notificaciones_admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  NotificacionPrioridad,
  NotificacionTipo,
} from '@/lib/types/admin'
import type { Tarea } from '@/lib/types/tareas'

type Sb = SupabaseClient<any, any, any>

function urlTarea(t: Pick<Tarea, 'id'>): string {
  return `/admin/tareas/${t.id}`
}

export async function notificar(
  sb: Sb,
  args: {
    userId: string
    tipo: NotificacionTipo
    titulo: string
    mensaje?: string
    prioridad?: NotificacionPrioridad
    urlAccion?: string
    entidadRelacionada?: string
    entidadId?: string
  },
): Promise<void> {
  await sb.from('notificaciones_admin').insert({
    user_id: args.userId,
    tipo: args.tipo,
    titulo: args.titulo,
    mensaje: args.mensaje ?? null,
    prioridad: args.prioridad ?? 'media',
    url_accion: args.urlAccion ?? null,
    entidad_relacionada: args.entidadRelacionada ?? null,
    entidad_id: args.entidadId ?? null,
  })
}

/** Notifica al responsable que se le asignó una tarea nueva. */
export async function notificarAsignacion(sb: Sb, tarea: Tarea): Promise<void> {
  if (!tarea.responsable_id) return
  await notificar(sb, {
    userId: tarea.responsable_id,
    tipo: 'tarea',
    titulo: 'Te asignaron una tarea',
    mensaje: `${tarea.codigo} · ${tarea.titulo}`,
    prioridad:
      tarea.prioridad === 'critica'
        ? 'critica'
        : tarea.prioridad === 'alta'
          ? 'alta'
          : 'media',
    urlAccion: urlTarea(tarea),
    entidadRelacionada: 'tarea',
    entidadId: tarea.id,
  })
}

/** Notifica al verificador que tiene algo para revisar. */
export async function notificarVerificacion(sb: Sb, tarea: Tarea): Promise<void> {
  if (!tarea.verificador_id) return
  await notificar(sb, {
    userId: tarea.verificador_id,
    tipo: 'tarea',
    titulo: 'Hay una tarea para verificar',
    mensaje: `${tarea.codigo} · ${tarea.titulo}`,
    prioridad: 'alta',
    urlAccion: urlTarea(tarea),
    entidadRelacionada: 'tarea',
    entidadId: tarea.id,
  })
}

/** Notifica al aprobador final que tiene algo para aprobar (nivel 3). */
export async function notificarAprobacion(sb: Sb, tarea: Tarea): Promise<void> {
  if (!tarea.aprobador_final_id) return
  await notificar(sb, {
    userId: tarea.aprobador_final_id,
    tipo: 'aprobacion',
    titulo: 'Tarea esperando tu aprobación final',
    mensaje: `${tarea.codigo} · ${tarea.titulo}`,
    prioridad: 'alta',
    urlAccion: urlTarea(tarea),
    entidadRelacionada: 'tarea',
    entidadId: tarea.id,
  })
}

/** Notifica a usuarios mencionados (@uuid) en un comentario. */
export async function notificarMenciones(
  sb: Sb,
  args: { tareaId: string; tareaTitulo: string; mencionadores: string[]; emisor: string },
): Promise<void> {
  const unicos = Array.from(new Set(args.mencionadores)).filter(
    (u) => u !== args.emisor,
  )
  if (unicos.length === 0) return
  await Promise.all(
    unicos.map((uid) =>
      notificar(sb, {
        userId: uid,
        tipo: 'tarea',
        titulo: 'Te mencionaron en una tarea',
        mensaje: args.tareaTitulo,
        prioridad: 'media',
        urlAccion: `/admin/tareas/${args.tareaId}`,
        entidadRelacionada: 'tarea',
        entidadId: args.tareaId,
      }),
    ),
  )
}
