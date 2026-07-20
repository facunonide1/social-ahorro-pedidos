import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { AusenciasClient, type AusenciaRow } from './ausencias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ausencias' }

const ENCARGADO = ['super_admin', 'gerente', 'administrativo', 'encargado_sucursal', 'rrhh', 'sucursal']

export default async function AusenciasPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal', 'rrhh'] })
  const adm = createAdminClient()

  const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
  const { data } = await adm.from('empleado_ausencias')
    .select('id, tipo, fecha_desde, fecha_hasta, estado, observaciones, empleados(nombre_completo, es_farmaceutico, sucursales(nombre))')
    .gte('fecha_hasta', inicioMes).order('fecha_desde', { ascending: false }).limit(300)

  const rows: AusenciaRow[] = ((data ?? []) as any[]).map((a) => ({
    id: a.id, tipo: a.tipo, desde: a.fecha_desde, hasta: a.fecha_hasta, estado: a.estado ?? 'aprobada',
    empleado: (a.empleados as any)?.nombre_completo ?? '—', esFarma: !!(a.empleados as any)?.es_farmaceutico,
    sucursal: (a.empleados as any)?.sucursales?.nombre ?? '—', observaciones: a.observaciones,
  }))

  return (
    <>
      <PageHeader title="Ausencias del mes" description="Solicitudes y ausencias del equipo. Aprobar una del farmacéutico recalcula la cobertura."
        breadcrumbs={[{ label: 'Personas', href: '/admin/rrhh' }, { label: 'Ausencias' }]} />
      <div className="p-4 md:p-6">
        <AusenciasClient rows={rows} puedeResolver={ENCARGADO.includes(profile.rol)} />
      </div>
    </>
  )
}
