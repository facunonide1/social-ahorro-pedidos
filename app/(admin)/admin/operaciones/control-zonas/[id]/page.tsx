import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ConteoZonaClient } from './conteo-client'

export const dynamic = 'force-dynamic'

export default async function ControlZonaDetallePage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { data: c } = await adm.from('controles_zona').select('*').eq('id', params.id).maybeSingle<any>()
  if (!c) notFound()
  const [{ data: zona }, { data: suc }, { data: items }] = await Promise.all([
    adm.from('zonas').select('nombre, tipo').eq('id', c.zona_id).maybeSingle(),
    adm.from('sucursales').select('nombre').eq('id', c.sucursal_id).maybeSingle(),
    adm.from('control_zona_items').select('id, producto_id, sku, stock_sistema, stock_contado, diferencia, valor_diferencia, productos_catalogo(nombre)').eq('control_id', c.id),
  ])

  return (
    <>
      <PageHeader title={`Control: ${(zona as any)?.nombre ?? 'Zona'} · ${(suc as any)?.nombre ?? ''}`}
        description="Contá lo que hay en la zona. El sistema compara con el stock y registra las diferencias."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Control por zonas', href: '/admin/operaciones/control-zonas' }, { label: 'Conteo' }]} />
      <div className="p-4 md:p-6">
        <ConteoZonaClient
          controlId={c.id} estado={c.estado} valor={Number(c.valor_diferencia)} nDif={c.n_diferencias}
          items={((items ?? []) as any[]).map((i) => ({ id: i.id, producto_id: i.producto_id, sku: i.sku, producto: i.productos_catalogo?.nombre ?? i.sku ?? '—', sistema: Number(i.stock_sistema), contado: Number(i.stock_contado), diferencia: Number(i.diferencia), valor: Number(i.valor_diferencia) }))}
        />
      </div>
    </>
  )
}
