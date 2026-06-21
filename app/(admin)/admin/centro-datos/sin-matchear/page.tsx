import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { SinMatchearClient, type SinMatchRow } from './sin-matchear-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sin matchear · Centro de Datos' }

export default async function SinMatchearPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()
  const { data } = await sb.from('items_sin_match').select('*').eq('estado', 'pendiente')
    .order('created_at', { ascending: false }).limit(500)

  const rows: SinMatchRow[] = ((data ?? []) as any[]).map((i) => ({
    id: i.id, sku: i.sku, codigo: i.codigo, barras: i.barras,
    descripcion: i.descripcion_origen, datos: i.datos ?? {}, created_at: i.created_at,
  }))

  return (
    <>
      <PageHeader title="Sin matchear" description="Productos del archivo que no matchearon con el catálogo. Creá uno nuevo, vinculá o ignorá."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Sin matchear' }]} />
      <div className="p-4 md:p-6">
        <SinMatchearClient rows={rows} />
      </div>
    </>
  )
}
