import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { DocumentosClient, type DocRow } from './documentos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Documentos a pagar' }

export default async function DocumentosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: docs }, { data: provs }, { data: sucs }] = await Promise.all([
    sb.from('facturas_proveedor').select('id, tipo_documento, numero_factura, total, fecha_emision, fecha_vencimiento, estado, sucursal_id, proveedores(razon_social)').order('fecha_emision', { ascending: false }).limit(1000),
    sb.from('proveedores').select('id, razon_social, cuit, plazo_pago_dias, forma_pago_default').eq('activo', true).order('razon_social'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const rows = ((docs ?? []) as any[]).map((d) => ({
    id: d.id, tipo: d.tipo_documento, numero: d.numero_factura, total: Number(d.total),
    emision: d.fecha_emision, vencimiento: d.fecha_vencimiento, estado: d.estado,
    sucursal_id: d.sucursal_id, proveedor: d.proveedores?.razon_social ?? '—',
  })) as DocRow[]

  return (
    <>
      <PageHeader title="Documentos a pagar" description="Facturas, notas de crédito/débito, recibos y comprobantes."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Documentos' }]} />
      <div className="p-4 md:p-6">
        <DocumentosClient
          docs={rows}
          proveedores={((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social, cuit: p.cuit, plazo: p.plazo_pago_dias ?? 0, forma: p.forma_pago_default }))}
          sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre }))}
        />
      </div>
    </>
  )
}
