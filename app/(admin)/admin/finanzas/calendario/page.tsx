import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { CalendarioClient, type Vencimiento } from './calendario-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendario de pagos' }

export default async function CalendarioPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: facturas }, { data: gfi }, { data: imp }, { data: chq }] = await Promise.all([
    sb.from('facturas_proveedor').select('id, numero_factura, total, fecha_vencimiento, tipo_documento, proveedores(razon_social)').not('estado', 'in', '("pagada","anulada","rechazada","borrador")').limit(2000),
    sb.from('gastos_fijos_instancias').select('id, monto, vencimiento, gastos_fijos(concepto)').eq('estado', 'pendiente').limit(1000),
    sb.from('impuestos_obligaciones').select('id, tipo, descripcion, monto_estimado, monto_real, fecha_vencimiento').not('estado', 'in', '("pagado")').limit(1000),
    sb.from('cheques').select('id, numero, monto, fecha_cobro_estimada').eq('tipo', 'emitido').not('estado', 'in', '("cobrado","anulado","rechazado")').limit(1000),
  ])

  const venc: Vencimiento[] = []
  for (const f of (facturas ?? []) as any[]) if (f.fecha_vencimiento && f.tipo_documento !== 'nota_credito') venc.push({ id: `f-${f.id}`, tipo: 'Factura', concepto: `${f.proveedores?.razon_social ?? '—'} · ${f.numero_factura ?? ''}`, fecha: f.fecha_vencimiento, monto: Number(f.total), href: '/hub/finanzas/documentos' })
  for (const g of (gfi ?? []) as any[]) if (g.vencimiento) venc.push({ id: `g-${g.id}`, tipo: 'Gasto fijo', concepto: g.gastos_fijos?.concepto ?? 'Gasto fijo', fecha: g.vencimiento, monto: Number(g.monto ?? 0), href: '/hub/finanzas/gastos-fijos' })
  for (const i of (imp ?? []) as any[]) if (i.fecha_vencimiento) venc.push({ id: `i-${i.id}`, tipo: 'Impuesto', concepto: i.descripcion || i.tipo, fecha: i.fecha_vencimiento, monto: Number(i.monto_real ?? i.monto_estimado ?? 0), href: '/hub/finanzas/impuestos' })
  for (const c of (chq ?? []) as any[]) if (c.fecha_cobro_estimada) venc.push({ id: `c-${c.id}`, tipo: 'Cheque', concepto: `Cheque ${c.numero}`, fecha: c.fecha_cobro_estimada, monto: Number(c.monto), href: '/hub/finanzas/cheques' })

  return (
    <>
      <PageHeader title="Calendario de pagos" description="Todos los vencimientos del mes en una vista única."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Calendario' }]} />
      <div className="p-4 md:p-6">
        <CalendarioClient vencimientos={venc} hoy={new Date().toISOString().slice(0, 10)} />
      </div>
    </>
  )
}
