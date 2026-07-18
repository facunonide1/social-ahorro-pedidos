import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { CalendarioOfertasClient, type EventoOferta, type CampaniaRow } from './calendario-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendario de ofertas' }

export default async function CalendarioOfertasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: ofertas }, { data: camps }, { data: propuestas }] = await Promise.all([
    sb.from('ofertas').select('id, codigo, nombre, tipo, estado, fecha_inicio, fecha_fin, campania_id, productos_ids, sucursales_ids').not('estado', 'in', '("rechazada","finalizada")').limit(1000),
    sb.from('campanias').select('id, nombre, objetivo, estado, fecha_inicio, fecha_fin').order('fecha_inicio', { ascending: false }).limit(200),
    sb.from('ofertas').select('id', { count: 'exact', head: true }).eq('propuesta_por', 'nora').eq('estado', 'borrador'),
  ])

  const eventos: EventoOferta[] = ((ofertas ?? []) as any[])
    .filter((o) => o.fecha_inicio)
    .map((o) => ({ id: o.id, nombre: o.nombre, tipo: o.tipo, estado: o.estado, fecha_inicio: o.fecha_inicio, fecha_fin: o.fecha_fin, productos: o.productos_ids ?? [], sucursales: o.sucursales_ids ?? [] }))
  const nPropuestas = (propuestas as any)?.count ?? 0

  const campanias: CampaniaRow[] = ((camps ?? []) as any[]).map((c) => ({ id: c.id, nombre: c.nombre, objetivo: c.objetivo, estado: c.estado, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin }))

  return (
    <>
      <PageHeader title="Calendario de ofertas" description="Planificá ofertas y campañas por fecha (día del niño, vuelta al cole…)."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Calendario' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <CalendarioOfertasClient eventos={eventos} campanias={campanias} nPropuestas={nPropuestas} hoy={new Date().toISOString().slice(0, 10)} />
      </div>
    </>
  )
}
