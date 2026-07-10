import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { getIrregularidades, getResumenIrregularidades, getPatrones, getPerdidasUnificadas, getRankings } from '@/lib/operaciones/irregularidades'
import { IrregularidadesClient } from './irregularidades-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Irregularidades de stock' }

export default async function IrregularidadesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'auditor', 'administrativo', 'tesoreria'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const f = { sucursalId, esTodas }

  const [filas, resumen, patrones, perdidas, rankings, { data: sucs }] = await Promise.all([
    getIrregularidades(adm, f, 500),
    getResumenIrregularidades(adm, f),
    getPatrones(adm, f),
    getPerdidasUnificadas(adm, f),
    getRankings(adm, f),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  return (
    <>
      <PageHeader title="Irregularidades de stock"
        description="Cruce diario stock vs ventas por sucursal. Toda diferencia se registra; priorizá por plata."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Irregularidades' }]} />
      <div className="p-4 md:p-6">
        <IrregularidadesClient
          filas={filas} resumen={resumen} patrones={patrones}
          perdidas={perdidas} rankings={rankings}
          sucursales={(sucs ?? []) as { id: string; nombre: string }[]}
          esTodas={esTodas}
        />
      </div>
    </>
  )
}
