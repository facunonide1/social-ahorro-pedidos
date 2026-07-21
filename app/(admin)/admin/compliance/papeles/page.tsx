import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { PapelesClient, type PapelRow, type SucLite } from './papeles-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Papeles de sucursal' }

export default async function PapelesPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal'] })
  const adm = createAdminClient()
  const [{ data: docs }, { data: sucs }] = await Promise.all([
    adm.from('compliance_documentos').select('id, tipo, descripcion, vence_at, archivo_url, sucursales(nombre)').order('vence_at', { ascending: true, nullsFirst: false }).limit(1000),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  const hoy = new Date().toISOString().slice(0, 10)
  const rows: PapelRow[] = ((docs ?? []) as any[]).map((d) => ({
    id: d.id, tipo: d.tipo, descripcion: d.descripcion, vence_at: d.vence_at, archivo_url: d.archivo_url,
    sucursal: (d.sucursales as any)?.nombre ?? '—',
    dias: d.vence_at ? Math.round((Date.parse(`${d.vence_at}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) : null,
  }))

  return (
    <>
      <PageHeader title="Papeles de sucursal" description="Habilitación, seguro, matafuegos, libreta sanitaria local… con semáforo de vencimiento."
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'Papeles' }]} />
      <div className="p-4 md:p-6"><PapelesClient rows={rows} sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre })) as SucLite[]} puedeEditar={['super_admin', 'gerente', 'administrativo', 'encargado_sucursal'].includes(profile.rol)} /></div>
    </>
  )
}
