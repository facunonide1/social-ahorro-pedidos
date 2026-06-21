import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import type { PerfilDatos } from '@/lib/types/centro-datos'
import { ImportarClient } from './importar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importar · Centro de Datos' }

export default async function ImportarPage({ searchParams }: { searchParams: { perfil?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()
  const { sucursalId } = getSucursalActiva()

  const [{ data: perfiles }, { data: sucursales }] = await Promise.all([
    sb.from('perfiles_datos').select('*').eq('activo', true).eq('direccion', 'import')
      .order('es_sistema', { ascending: false }).order('nombre'),
    sb.from('sucursales').select('id, nombre').order('nombre'),
  ])

  return (
    <>
      <PageHeader title="Importar" description="Subí los archivos que exporta SIFACO. NORA los lee, valida y aplica con rollback."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Importar' }]} />
      <div className="p-4 md:p-6">
        <ImportarClient
          perfiles={(perfiles ?? []) as PerfilDatos[]}
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
          sucursalActiva={sucursalId}
          perfilPreseleccionado={searchParams.perfil ?? null}
        />
      </div>
    </>
  )
}
