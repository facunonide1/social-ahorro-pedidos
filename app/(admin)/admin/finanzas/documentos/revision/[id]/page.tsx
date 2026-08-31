import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { urlFirmada } from '@/lib/documentos/subida'
import { RevisionClient } from './revision-client'

import { paginarProductos } from '@/lib/catalogo/indice'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revisar documento' }

export default async function RevisionPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { lote?: string }
}) {
  // Igual que las otras: si el lector está apagado, devuelve este texto.
  const titulo = await tituloDePantalla('documentos', '/admin/finanzas/documentos/revision/[id]', 'Revisar documento')
  // E.6 · Solo roles con acceso a Finanzas o Compras.
  const g = await gateDocumentos('crear')
  if ('error' in g) redirect('/admin/finanzas/documentos')

  const adm = createAdminClient()
  const { data: ext } = await adm
    .from('doc_extracciones')
    .select('id, documento_id, archivo_path, mime_type, estado, error, lote_id, archivo_nombre')
    .eq('id', params.id)
    .maybeSingle()

  if (!ext) notFound()

  const loteId = searchParams.lote ?? ext.lote_id ?? null

  // Ya confirmado: no se revisa dos veces. Si venía encadenado, salta al que sigue.
  if (ext.documento_id) {
    const sig = loteId ? await siguientePendiente(adm, loteId, params.id) : null
    redirect(sig ? `/admin/finanzas/documentos/revision/${sig}?lote=${loteId}` : '/admin/finanzas/documentos')
  }

  // Progreso del lote, para saber cuántas faltan sin volver al listado.
  let progreso: { hechas: number; total: number } | null = null
  let siguiente: string | null = null
  if (loteId) {
    const { data: delLote } = await adm
      .from('doc_extracciones')
      .select('id, documento_id, estado')
      .eq('lote_id', loteId)
      .order('created_at')

    const filas = (delLote ?? []) as any[]
    // Solo cuentan las que se leyeron bien: las que fallaron no se pueden revisar.
    const revisables = filas.filter((f) => f.estado === 'ok' || f.documento_id)
    progreso = { hechas: revisables.filter((f) => f.documento_id).length, total: revisables.length }
    siguiente = revisables.find((f) => !f.documento_id && f.id !== params.id)?.id ?? null
  }

  const [imagenUrl, { data: provs }, { data: sucs }, { data: prods }] = await Promise.all([
    urlFirmada(adm, ext.archivo_path),
    adm.from('proveedores').select('id, razon_social, cuit').eq('activo', true).order('razon_social').limit(2000),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    paginarProductos(adm, 'id, sku, nombre'),
  ])

  return (
    <>
      <PageHeader
        title={titulo}
        description={
          progreso && progreso.total > 1
            ? `${progreso.hechas} de ${progreso.total} confirmadas · ${ext.archivo_nombre ?? 'documento'}`
            : 'Confirmá lo que se leyó del papel. Nada se guarda hasta que lo revises.'
        }
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
          loteId={loteId}
          siguienteId={siguiente}
          progreso={progreso}
        />
      </div>
    </>
  )
}

/** El próximo documento del lote que todavía nadie confirmó. */
async function siguientePendiente(adm: any, loteId: string, actual: string): Promise<string | null> {
  const { data } = await adm
    .from('doc_extracciones')
    .select('id')
    .eq('lote_id', loteId)
    .eq('estado', 'ok')
    .is('documento_id', null)
    .neq('id', actual)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
