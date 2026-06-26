import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { getVencimientos, resumenVencimientos } from '@/lib/operaciones/vencimientos'
import { VencimientosClient } from './vencimientos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vencimientos' }

export default async function VencimientosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const [filas, { data: sucs }] = await Promise.all([
    getVencimientos(adm, { sucursalId, esTodas }),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  const resumen = resumenVencimientos(filas)

  return (
    <>
      <PageHeader title="Vencimientos"
        description="Control manual por producto. NORA decide qué hacer cruzando vencimiento + stock."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Vencimientos' }]} />
      <div className="p-4 md:p-6">
        <VencimientosClient filas={filas} resumen={resumen} sucursales={(sucs ?? []) as any} sucursalActiva={sucursalId} esTodas={esTodas} />
      </div>
    </>
  )
}
