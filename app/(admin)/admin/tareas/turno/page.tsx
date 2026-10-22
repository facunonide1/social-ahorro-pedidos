import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { RepartoClient } from './reparto-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reparto del turno' }

/**
 * EL REPARTO DE TAREAS DEL TURNO.
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────────────
 *
 * Las tareas del día nacen con un rol —«sucursal», «administrativo»— y sin
 * persona. Una tarea sin dueño a las 9 de la mañana es una tarea que a las 6 de
 * la tarde nadie hizo, y al día siguiente nadie puede contestar de quién era.
 *
 * Al empezar el turno el encargado ve lo que hay y reparte. Queda escrito quién
 * repartió y a quién, porque si la tarea no se hizo esa pregunta tiene que
 * tener respuesta.
 */
export default async function TurnoPage() {
  const yo = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'encargado_sucursal', 'sucursal', 'administrativo'],
  })
  const sb = createClient()
  const hoy = new Date().toISOString().slice(0, 10)

  // Las tareas de hoy de esta sucursal que todavía no tienen persona. La RLS ya
  // filtra por sucursal para un encargado.
  //
  // `es_demo: false` porque una tarea de demostración repartida le hace perder
  // la mañana a una persona real. Y el `limit` va PEGADO a la cadena, sin
  // comentarios en el medio: el auditor de cortes lee la cadena y un comentario
  // entre dos eslabones le hace ver una consulta sin límite.
  const [{ data: tareas }, { data: gente }, { data: repartidas }] = await Promise.all([
    sb.from('tareas')
      .select('id, titulo, estado, prioridad, fecha_vencimiento, responsable_id, sucursal_id, tipo_tarea_id, tipos_tareas(nombre)')
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'reclamada'])
      .eq('es_demo', false)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(200),
    sb.from('users_admin')
      .select('id, rol, activo, sucursal_id')
      .eq('activo', true).limit(100),
    sb.from('turno_reparto').select('*').eq('fecha', hoy),
  ])

  return (
    <>
      <PageHeader
        title="Reparto del turno"
        description="Lo que hay que hacer hoy y quién lo hace. Queda escrito quién repartió."
        breadcrumbs={[{ label: 'Tareas', href: '/admin/tareas' }, { label: 'Turno' }]}
      />
      <div className="p-4 md:p-6">
        <RepartoClient
          tareas={(tareas ?? []) as any[]}
          gente={(gente ?? []) as any[]}
          repartidas={(repartidas ?? []) as any[]}
          miSucursal={yo.sucursal_id ?? null}
          fecha={hoy}
        />
      </div>
    </>
  )
}
