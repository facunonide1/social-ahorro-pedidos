import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { urlFirmada } from '@/lib/documentos/subida'
import { VisorDocumento } from '@/components/documentos/visor-documento'
import { formatARS } from '@/lib/utils/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Documento capturado' }

/**
 * Ficha de un documento cargado por foto: la imagen original al lado de lo que
 * se confirmó. El original es la prueba ante el proveedor cuando hay que
 * discutir un precio o una cantidad.
 */
export default async function DocumentoCapturadoPage({ params }: { params: { docId: string } }) {
  const g = await gateDocumentos('ver')
  if ('error' in g) redirect('/admin/finanzas/documentos')

  const adm = createAdminClient()
  const { data: doc } = await adm
    .from('doc_documentos')
    .select('id, tipo, numero, punto_venta, fecha_emision, fecha_vencimiento, total, subtotal, impuestos, percepciones, confirmado_at, factura_proveedor_id, proveedores:tercero_id(razon_social, cuit), sucursales:unidad_negocio_id(nombre)')
    .eq('id', params.docId)
    .maybeSingle()

  if (!doc) notFound()

  const [{ data: lineas }, { data: ext }] = await Promise.all([
    adm.from('doc_lineas').select('nro_linea, descripcion_leida, codigo_tercero, cantidad, precio_unitario, total_linea, match_estado, productos_catalogo:item_id(sku, nombre)').eq('documento_id', doc.id).order('nro_linea'),
    adm.from('doc_extracciones').select('archivo_path, mime_type, modelo, prompt_version, confianza_global').eq('documento_id', doc.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const imagenUrl = ext?.archivo_path ? await urlFirmada(adm, ext.archivo_path) : null
  const d = doc as any

  return (
    <>
      <PageHeader
        title={`${d.tipo} ${d.punto_venta ?? ''}-${d.numero ?? ''}`}
        description={`${d.proveedores?.razon_social ?? 'proveedor'} · cargada por foto`}
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Documentos', href: '/admin/finanzas/documentos' }, { label: 'Capturado' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        <Link href="/admin/finanzas/documentos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver a documentos a pagar
        </Link>

        <div className="grid gap-4 lg:grid-cols-2">
          <VisorDocumento url={imagenUrl} esPdf={ext?.mime_type === 'application/pdf'} />

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lo confirmado</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Dato label="Proveedor" valor={d.proveedores?.razon_social} />
                <Dato label="CUIT" valor={d.proveedores?.cuit} />
                <Dato label="Sucursal compradora" valor={d.sucursales?.nombre} />
                <Dato label="Emisión" valor={d.fecha_emision} />
                <Dato label="Vencimiento" valor={d.fecha_vencimiento} />
                <Dato label="Total" valor={d.total != null ? formatARS(Number(d.total)) : null} />
              </dl>
              {ext?.modelo && (
                <p className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  Leído con {ext.modelo} · prompt {ext.prompt_version}
                  {ext.confianza_global != null && ` · confianza ${Math.round(Number(ext.confianza_global) * 100)}%`}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Renglones ({lineas?.length ?? 0})
              </div>
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {((lineas ?? []) as any[]).map((l) => (
                      <tr key={l.nro_linea} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5">
                          <div className={l.match_estado === 'ignorado' ? 'text-muted-foreground line-through' : ''}>{l.descripcion_leida}</div>
                          {l.productos_catalogo && (
                            <div className="text-[10px] text-muted-foreground">
                              → <span className="font-mono">{l.productos_catalogo.sku}</span> {l.productos_catalogo.nombre}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{l.cantidad ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{l.total_linea != null ? formatARS(Number(l.total_linea)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={valor ? 'font-medium' : 'text-muted-foreground'}>{valor ?? '—'}</dd>
    </div>
  )
}
