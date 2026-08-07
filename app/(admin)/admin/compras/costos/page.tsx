import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { grillaComparador } from '@/lib/documentos/costos'
import { DOC_DIAS_DATO_FRESCO, DOC_DIAS_VOLUMEN } from '@/lib/documentos/config'
import { ComparadorCostosClient } from './comparador-costos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparador de costos' }

/**
 * Comparador de COSTOS REALES: lo que efectivamente se pagó, según las facturas
 * cargadas.
 *
 * Es distinto del comparador de /admin/compras/comparador, que compara LISTAS
 * DE PRECIOS — lo que los proveedores dicen que cuesta — y desde ahí se arman
 * órdenes de compra. Los dos conviven a propósito y se enlazan mutuamente:
 * uno sirve para decidir a quién comprarle, el otro para saber si lo que te
 * cobraron coincide con lo que te habían dicho.
 */
export default async function ComparadorCostosPage({ searchParams }: { searchParams: { rubro?: string; solo?: string } }) {
  const g = await gateDocumentos('ver')
  if ('error' in g) redirect('/admin/compras')

  const soloFacturas = searchParams.solo !== 'todo'
  const adm = createAdminClient()
  const { filas, proveedores, totalAhorro } = await grillaComparador(adm, {
    soloFacturas,
    rubro: searchParams.rubro ?? null,
  })

  return (
    <>
      <PageHeader
        title="Comparador de costos"
        description="Lo que realmente pagaste, por producto y por proveedor."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Costos' }]}
      />
      <div className="p-4 md:p-6">
        <ComparadorCostosClient
          filas={filas}
          proveedores={proveedores}
          totalAhorro={totalAhorro}
          soloFacturas={soloFacturas}
          diasFresco={DOC_DIAS_DATO_FRESCO}
          diasVolumen={DOC_DIAS_VOLUMEN}
        />
      </div>
    </>
  )
}
