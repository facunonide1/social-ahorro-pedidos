import { ListChecks } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { TareaConTipo, TipoTarea } from '@/lib/types/tareas'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskCard } from '@/components/tareas/task-card'
import { NuevaTareaSheet } from '@/app/(admin)/admin/tareas/nueva-tarea-sheet'

/**
 * Componente reusable para mostrar y crear tareas vinculadas a una
 * entidad del ERP (factura, pago, pedido, proveedor, etc.).
 *
 * Server component — auto-fetcha todo lo que necesita. Para usarlo,
 * desde cualquier página server-side:
 *
 *   <TareasRelacionadas
 *     entidadTipo="factura"
 *     entidadId={factura.id}
 *     entidadUrl={`/admin/finanzas/documentos`}
 *     entidadTitulo={`Factura ${factura.numero}`}
 *   />
 */
export async function TareasRelacionadas({
  entidadTipo,
  entidadId,
  entidadUrl,
  entidadTitulo,
}: {
  entidadTipo: string
  entidadId: string
  entidadUrl?: string | null
  entidadTitulo?: string | null
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const [{ data: tareasData }, { data: tiposData }, users, { data: sucData }] =
    await Promise.all([
      sb
        .from('tareas')
        .select(
          '*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)',
        )
        .eq('entidad_relacionada', entidadTipo)
        .eq('entidad_id', entidadId)
        .order('created_at', { ascending: false })
        .limit(20),
      sb.from('tipos_tareas').select('*').eq('activo', true).order('nombre'),
      listAdminUsers(),
      sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    ])

  const tareas = (tareasData ?? []) as TareaConTipo[]
  const usersMap = Object.fromEntries(
    users.map((u) => [u.id, { nombre: u.nombre, email: u.email }]),
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ListChecks className="size-3.5" />
          Tareas vinculadas ({tareas.length})
        </CardTitle>
        <NuevaTareaSheet
          tipos={(tiposData ?? []) as TipoTarea[]}
          users={users}
          sucursales={(sucData ?? []) as { id: string; nombre: string }[]}
          currentUserId={profile.id}
          triggerLabel="Crear tarea"
          defaultEntidad={{
            tipo: entidadTipo,
            id: entidadId,
            url: entidadUrl ?? null,
            titulo: entidadTitulo ?? null,
          }}
        />
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        {tareas.length === 0 ? (
          <div className="py-3 text-center text-xs text-muted-foreground">
            Sin tareas vinculadas. Creá la primera para hacer seguimiento.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {tareas.map((t) => (
              <TaskCard
                key={t.id}
                tarea={t}
                responsableNombre={
                  t.responsable_id
                    ? usersMap[t.responsable_id]?.nombre ||
                      usersMap[t.responsable_id]?.email
                    : null
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
