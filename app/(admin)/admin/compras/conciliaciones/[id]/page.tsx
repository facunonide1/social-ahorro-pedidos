import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { conciliar } from '@/lib/documentos/conciliar'
import { resumirConciliacion } from '@/lib/documentos/conciliacion-texto'
import { FichaConciliacion } from './ficha-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conciliación' }

export default async function ConciliacionPage({ params }: { params: { id: string } }) {
  const g = await gateDocumentos('ver')
  if ('error' in g) redirect('/admin/compras/conciliaciones')

  const adm = createAdminClient()
  const { data: c } = await adm
    .from('doc_conciliaciones')
    .select('id, estado, monto_diferencia, nota, motivo_cierre, resuelto_at, proveedor_id, proveedores:proveedor_id(razon_social), sucursales:sucursal_id(nombre)')
    .eq('id', params.id)
    .maybeSingle()

  if (!c) notFound()

  // Se recalcula al abrir: puede haber entrado otro papel desde la última vez.
  const r = await conciliar(adm, params.id, g.userId)
  const resumen = resumirConciliacion(r)

  const [{ data: ordenes }, { data: docs }, { data: reclamos }] = await Promise.all([
    adm.from('doc_conciliacion_ordenes').select('orden_id, ordenes_compra(codigo, total_estimado, created_at)').eq('conciliacion_id', params.id),
    adm.from('doc_conciliacion_documentos').select('documento_id, rol, doc_documentos(numero, punto_venta, fecha_emision, total)').eq('conciliacion_id', params.id),
    adm.from('devoluciones_proveedor').select('id, estado, motivo, monto_esperado, created_at').eq('conciliacion_id', params.id),
  ])

  const cc = c as any

  return (
    <>
      <PageHeader
        title={`Conciliación · ${cc.proveedores?.razon_social ?? 'proveedor'}`}
        description={cc.sucursales?.nombre ?? undefined}
        breadcrumbs={[{ label: 'Compras' }, { label: 'Conciliaciones', href: '/admin/compras/conciliaciones' }, { label: 'Detalle' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        <Link href="/admin/compras/conciliaciones" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver a la bandeja
        </Link>

        <FichaConciliacion
          conciliacionId={params.id}
          estado={r.estado}
          resumen={resumen}
          filas={r.filas}
          totales={r.totales}
          falta={r.falta}
          ordenes={((ordenes ?? []) as any[]).map((o) => ({
            id: o.orden_id,
            codigo: o.ordenes_compra?.codigo ?? null,
            total: Number(o.ordenes_compra?.total_estimado ?? 0),
            fecha: String(o.ordenes_compra?.created_at ?? '').slice(0, 10),
          }))}
          documentos={((docs ?? []) as any[]).map((d) => ({
            id: d.documento_id,
            rol: d.rol,
            numero: `${d.doc_documentos?.punto_venta ?? ''}-${d.doc_documentos?.numero ?? ''}`,
            fecha: d.doc_documentos?.fecha_emision ?? null,
            total: Number(d.doc_documentos?.total ?? 0),
          }))}
          reclamos={((reclamos ?? []) as any[]).map((x) => ({
            id: x.id,
            estado: x.estado,
            motivo: x.motivo,
            monto: x.monto_esperado != null ? Number(x.monto_esperado) : null,
          }))}
          motivoCierre={cc.motivo_cierre}
          nota={cc.nota}
        />
      </div>
    </>
  )
}
