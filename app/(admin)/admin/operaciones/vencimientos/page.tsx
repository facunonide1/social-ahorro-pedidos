import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { parametro, tituloDePantalla } from '@/lib/os/definicion'
import { getVencimientos, resumenVencimientos } from '@/lib/operaciones/vencimientos'
import { VencimientosClient } from './vencimientos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vencimientos' }

export default async function VencimientosPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/vencimientos', 'Vencimientos')

  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const [filas, { data: sucs }, { data: provs }] = await Promise.all([
    getVencimientos(adm, { sucursalId, esTodas }),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    adm.from('proveedores').select('id, razon_social, dias_ventana_devolucion').eq('activo', true).order('razon_social'),
  ])
  // Puede venir de la declaración de la fábrica. Si el lector está apagado o
  // algo falla, devuelve estos mismos 30 días: la pantalla no cambia.
  const diasAviso = await parametro('stock', 'dias_aviso_vencimiento', 30)
  const resumen = resumenVencimientos(filas, diasAviso)

  return (
    <>
      <PageHeader title={tituloDeclarado}
        description="Control manual por producto. NORA decide qué hacer cruzando vencimiento + stock."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Vencimientos' }]} />
      <div className="p-4 md:p-6">
        <VencimientosClient filas={filas} resumen={resumen} sucursales={(sucs ?? []) as any} proveedores={(provs ?? []) as any} sucursalActiva={sucursalId} esTodas={esTodas} diasAviso={diasAviso} />
      </div>
    </>
  )
}
