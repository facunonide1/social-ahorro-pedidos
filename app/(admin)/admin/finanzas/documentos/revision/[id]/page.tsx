import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { urlFirmada } from '@/lib/documentos/subida'
import { RevisionClient } from './revision-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revisar documento' }

export default async function RevisionPage({ params }: { params: { id: string } }) {
  // E.6 · Solo roles con acceso a Finanzas o Compras.
  const g = await gateDocumentos('crear')
  if ('error' in g) redirect('/admin/finanzas/documentos')

  const adm = createAdminClient()
  const { data: ext } = await adm
    .from('doc_extracciones')
    .select('id, documento_id, archivo_path, mime_type, estado, error')
    .eq('id', params.id)
    .maybeSingle()

  if (!ext) notFound()

  // Ya confirmado: no se revisa dos veces.
  if (ext.documento_id) redirect('/admin/finanzas/documentos')

  const [imagenUrl, { data: provs }, { data: sucs }, { data: prods }] = await Promise.all([
    urlFirmada(adm, ext.archivo_path),
    adm.from('proveedores').select('id, razon_social, cuit').eq('activo', true).order('razon_social').limit(2000),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    adm.from('productos_catalogo').select('id, sku, nombre').eq('activo', true).order('nombre').limit(5000),
  ])

  return (
    <>
      <PageHeader
        title="Revisar documento"
        description="Confirmá lo que se leyó del papel. Nada se guarda hasta que lo revises."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Documentos', href: '/admin/finanzas/documentos' }, { label: 'Revisión' }]}
      />
      <div className="p-4 md:p-6">
        <RevisionClient
          extraccionId={ext.id}
          estadoInicial={ext.estado}
          errorInicial={ext.error}
          imagenUrl={imagenUrl}
          esPdf={ext.mime_type === 'application/pdf'}
          proveedores={(provs ?? []) as any[]}
          sucursales={(sucs ?? []) as any[]}
          productos={(prods ?? []) as any[]}
        />
      </div>
    </>
  )
}
