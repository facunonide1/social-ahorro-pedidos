import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { generarTareasDeControl } from '@/lib/documentos/dossier-proveedor'
import { BandejaClient, type FilaBandeja } from './bandeja-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conciliaciones' }

export default async function ConciliacionesPage() {
  const g = await gateDocumentos('ver')
  if ('error' in g) redirect('/admin/compras')

  const adm = createAdminClient()

  // Lazy: Vercel Hobby no tiene crons finos, así que las tareas de control se
  // generan al abrir la bandeja. Mismo patrón que el motor de reclamos.
  await generarTareasDeControl(adm)

  const { data } = await adm
    .from('doc_conciliaciones')
    .select(`
      id, estado, monto_diferencia, diferencias, created_at, evaluada_at, nota,
      proveedores:proveedor_id(razon_social),
      sucursales:sucursal_id(nombre),
      doc_conciliacion_ordenes(orden_id, ordenes_compra(codigo)),
      doc_conciliacion_documentos(rol)
    `)
    // Primero la plata: una diferencia de $80.000 de hace tres días importa
    // más que una de $900 de hace un mes.
    .order('monto_diferencia', { ascending: false, nullsFirst: false })
    .limit(500)

  const filas: FilaBandeja[] = ((data ?? []) as any[]).map((c) => {
    const roles = ((c.doc_conciliacion_documentos ?? []) as any[]).map((d) => d.rol)
    const tipos = new Set<string>()
    for (const d of (Array.isArray(c.diferencias) ? c.diferencias : []) as any[]) {
      for (const x of d.diferencias ?? []) tipos.add(x.tipo)
    }
    return {
      id: c.id,
      estado: c.estado,
      proveedor: c.proveedores?.razon_social ?? '—',
      sucursal: c.sucursales?.nombre ?? null,
      ordenes: ((c.doc_conciliacion_ordenes ?? []) as any[]).map((o) => o.ordenes_compra?.codigo).filter(Boolean),
      tieneRemito: roles.includes('remito'),
      tieneFactura: roles.includes('factura'),
      tiposDiferencia: [...tipos],
      monto: Number(c.monto_diferencia ?? 0),
      dias: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86_400_000),
      compraDirecta: !((c.doc_conciliacion_ordenes ?? []) as any[]).length,
    }
  })

  return (
    <>
      <PageHeader
        title="Conciliaciones"
        description="Lo que pediste contra lo que entregaron contra lo que facturaron."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Conciliaciones' }]}
      />
      <div className="p-4 md:p-6">
        <BandejaClient filas={filas} />
      </div>
    </>
  )
}
