import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { LoteClient } from './lote-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Carga en lote' }

export default async function LotePage() {
  const g = await gateDocumentos('crear')
  if ('error' in g) redirect('/admin/finanzas/documentos')

  return (
    <>
      <PageHeader
        title="Cargar facturas en lote"
        description="Subí varias de una vez. Se leen de a poco y después las revisás una tras otra."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Documentos', href: '/admin/finanzas/documentos' }, { label: 'Lote' }]}
      />
      <div className="p-4 md:p-6">
        <LoteClient />
      </div>
    </>
  )
}
