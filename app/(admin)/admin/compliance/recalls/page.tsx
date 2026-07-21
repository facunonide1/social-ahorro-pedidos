import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RecallsClient, type RecallRow } from './recalls-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recalls' }

export default async function RecallsPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal'] })
  const adm = createAdminClient()
  const { data } = await adm.from('compliance_recalls').select('id, motivo, referencia_anmat, estado, created_at, cerrado_at, productos_catalogo(nombre, sku)').order('created_at', { ascending: false }).limit(200)
  const recalls = (data ?? []) as any[]

  // Tareas pendientes por recall activo.
  const pendPorRecall = new Map<string, number>()
  for (const r of recalls.filter((x) => x.estado === 'activo')) {
    const { count } = await adm.from('tareas').select('id', { count: 'exact', head: true }).contains('datos_custom', { recall_id: r.id }).not('estado', 'in', '("completada","en_verificacion","en_aprobacion")')
    pendPorRecall.set(r.id, count ?? 0)
  }

  const rows: RecallRow[] = recalls.map((r) => ({
    id: r.id, producto: (r.productos_catalogo as any)?.nombre ?? '—', sku: (r.productos_catalogo as any)?.sku ?? null,
    motivo: r.motivo, referencia: r.referencia_anmat, estado: r.estado, creado: String(r.created_at).slice(0, 16).replace('T', ' '),
    cerrado: r.cerrado_at ? String(r.cerrado_at).slice(0, 16).replace('T', ' ') : null,
    horas: r.cerrado_at ? Math.round((Date.parse(r.cerrado_at) - Date.parse(r.created_at)) / 3_600_000) : null,
    pendientes: pendPorRecall.get(r.id) ?? 0,
  }))

  return (
    <>
      <PageHeader title="Recalls" description="Retiro de producto en 1 clic: bloquea el SKU, dispara las tareas de retiro con foto y el anuncio. Cerrar revierte."
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'Recalls' }]} />
      <div className="p-4 md:p-6"><RecallsClient rows={rows} puedeGestionar={['super_admin', 'gerente'].includes(profile.rol)} /></div>
    </>
  )
}
