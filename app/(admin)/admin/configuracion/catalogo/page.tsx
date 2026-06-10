import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import type { ProductoCatalogo } from '@/lib/types/catalogo'
import { PageHeader } from '@/components/shared/page-header'

import { CatalogoClient } from './catalogo-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de productos' }

export default async function CatalogoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })

  const sb = createClient()
  const { data, error } = await sb
    .from('productos_catalogo')
    .select('*')
    .order('nombre', { ascending: true })
    .limit(1000)

  const productos = (data ?? []) as ProductoCatalogo[]
  const laboratorios = Array.from(
    new Set(productos.map((p) => p.laboratorio).filter(Boolean) as string[]),
  ).sort()

  return (
    <>
      <PageHeader
        title="Catálogo de productos"
        description="Vademécum propio: enriquecé productos y cargá masivamente por CSV."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Catálogo' }]}
      />
      <div className="p-4 md:p-6">
        <CatalogoClient
          productos={productos}
          laboratorios={laboratorios}
          loadError={error?.message ?? null}
        />
      </div>
    </>
  )
}
