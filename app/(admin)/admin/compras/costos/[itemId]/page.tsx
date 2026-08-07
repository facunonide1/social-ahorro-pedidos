import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { fichaCostos } from '@/lib/documentos/costos'
import { FichaCostosClient } from './ficha-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Costos del producto' }

export default async function CostosProductoPage({
  params,
  searchParams,
}: {
  params: { itemId: string }
  searchParams: { solo?: string }
}) {
  const g = await gateDocumentos('ver')
  if ('error' in g) redirect('/admin/compras')

  const soloFacturas = searchParams.solo === 'facturas'
  const adm = createAdminClient()
  const ficha = await fichaCostos(adm, params.itemId, { soloFacturas })

  if (!ficha) notFound()

  return (
    <>
      <PageHeader
        title={ficha.item.nombre}
        description={`SKU ${ficha.item.sku} · costos de compra`}
        breadcrumbs={[{ label: 'Compras' }, { label: 'Costos', href: '/admin/compras/costos' }, { label: ficha.item.sku }]}
      />
      <div className="p-4 md:p-6">
        <FichaCostosClient ficha={ficha} soloFacturas={soloFacturas} />
      </div>
    </>
  )
}
