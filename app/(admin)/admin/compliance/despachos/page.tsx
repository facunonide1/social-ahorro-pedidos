import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import { PageHeader } from '@/components/shared/page-header'
import { DespachosClient, type DespachoRow } from './despachos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Despachos de controlados' }

export default async function DespachosPage({ searchParams }: { searchParams: { dias?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal', 'rrhh'] })
  const adm = createAdminClient()
  const dias = [7, 30, 90].includes(Number(searchParams?.dias)) ? Number(searchParams.dias) : 30
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [{ data }, users] = await Promise.all([
    adm.from('compliance_despachos').select('id, turno, created_at, registrado_por, productos_catalogo(nombre, sku), sucursales(nombre)').gte('created_at', desde).order('created_at', { ascending: false }).limit(1000),
    listAdminUsersLite(adm, { soloActivos: false }),
  ])
  const userMap = new Map((users as any[]).map((u) => [u.id, u.nombre || u.email || u.id.slice(0, 6)]))

  const rows: DespachoRow[] = ((data ?? []) as any[]).map((d) => ({
    id: d.id, fecha: String(d.created_at).slice(0, 16).replace('T', ' '), turno: d.turno ?? '—',
    producto: (d.productos_catalogo as any)?.nombre ?? '—', sku: (d.productos_catalogo as any)?.sku ?? null,
    sucursal: (d.sucursales as any)?.nombre ?? '—', persona: userMap.get(d.registrado_por) ?? '—',
  }))

  return (
    <>
      <PageHeader title="Despachos de controlados" description="Registro interno (quién/cuándo/SKU/turno). El libro recetario rubricado es el registro legal."
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'Despachos' }]} />
      <div className="p-4 md:p-6"><DespachosClient rows={rows} dias={dias} /></div>
    </>
  )
}
