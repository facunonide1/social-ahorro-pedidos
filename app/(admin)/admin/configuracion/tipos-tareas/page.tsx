import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { TipoTareaFull } from '@/lib/types/tareas-enterprise'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { TiposClient } from './tipos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tipos de tareas' }

export default async function TiposTareasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()
  const { data, error } = await sb
    .from('tipos_tareas')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })
  const tipos = (data ?? []) as TipoTareaFull[]

  return (
    <>
      <PageHeader
        title="Tipos de tareas"
        description="Plantillas de tarea: workflow de verificación, evidencias, checklist, puntos y recurrencia."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Tipos de tareas' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <TiposClient tipos={tipos} />
      </div>
    </>
  )
}
