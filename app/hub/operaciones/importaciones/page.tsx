import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'

import { ImportacionesClient } from './importaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importaciones' }

export default async function ImportacionesPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador'] })
  const sb = createClient()

  const [{ data: sucs }, { data: imports }, { data: configs }] = await Promise.all([
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb.from('stock_imports').select('id, sucursal_id, fecha, archivo_nombre, filas_total, ventas_detectadas, discrepancias, estado, created_at').order('created_at', { ascending: false }).limit(50),
    sb.from('config_import_stock').select('id, nombre, tipo, mapeo_columnas').eq('activo', true).order('created_at', { ascending: false }),
  ])

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Importaciones"
        description="Subí el Excel diario de SIFACO por sucursal. NORA detecta ventas por diferencia de stock."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Importaciones' }]}
      />
      <div className="p-4 md:p-6">
        <ImportacionesClient
          sucursales={(sucs ?? []) as any[]}
          imports={(imports ?? []) as any[]}
          configs={(configs ?? []) as any[]}
        />
      </div>
    </HubShell>
  )
}
