import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import type { PerfilDatos } from '@/lib/types/centro-datos'
import { PerfilesClient } from './perfiles-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Perfiles · Centro de Datos' }

export default async function PerfilesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()
  const { data: perfiles } = await sb.from('perfiles_datos').select('*').eq('activo', true)
    .order('direccion').order('es_sistema', { ascending: false }).order('nombre')

  return (
    <>
      <PageHeader title="Perfiles de mapeo" description="Configurá el mapeo de columnas una vez por tipo de archivo y reusalo."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Perfiles' }]} />
      <div className="p-4 md:p-6">
        <PerfilesClient perfiles={(perfiles ?? []) as PerfilDatos[]} />
      </div>
    </>
  )
}
