import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { urlFirmada } from '@/lib/documentos/subida'
import { RevisionClient } from './revision-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revisar documento' }

export default async function RevisionPage({ params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) redirect('/admin/finanzas/documentos')

  const adm = createAdminClient()
  const { data: ext } = await adm
    .from('doc_extracciones')
    .select('id, documento_id, archivo_path, mime_type, estado, error, confianza_global, campos_dudosos, respuesta_cruda, modelo, prompt_version, procesado_at')
    .eq('id', params.id)
    .maybeSingle()

  if (!ext) notFound()

  const imagenUrl = await urlFirmada(adm, ext.archivo_path)

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
          estado={ext.estado}
          error={ext.error}
          datos={ext.estado === 'ok' ? (ext.respuesta_cruda as any) : null}
          imagenUrl={imagenUrl}
          esPdf={ext.mime_type === 'application/pdf'}
        />
      </div>
    </>
  )
}
