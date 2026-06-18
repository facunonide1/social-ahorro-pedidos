import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { PagosClient, type PagoRow, type SucCaja, type CuentaSaldo } from './pagos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pagos' }

export default async function PagosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'] })
  const sb = createClient()

  const [{ data: pagos }, { data: provs }, { data: sucs }, { data: cajas }, { data: cuentas }, { data: movs }] = await Promise.all([
    sb.from('pagos').select('id, numero_orden_pago, fecha_pago, monto_total, monto_neto, retenciones_aplicadas, origen_tipo, metodo_pago, estado, proveedores(razon_social)').order('fecha_pago', { ascending: false }).limit(100),
    sb.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb.from('caja_general').select('sucursal_id, saldo_actual').eq('tipo', 'caja_general'),
    sb.from('cuentas_bancarias_propias').select('id, nombre, banco').eq('activa', true).order('nombre'),
    sb.from('movimientos_bancarios').select('cuenta_bancaria_id, tipo, monto').limit(20000),
  ])

  const cajaBySuc = new Map(((cajas ?? []) as any[]).map((c) => [c.sucursal_id, Number(c.saldo_actual)]))
  const sucursales: SucCaja[] = ((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, saldo: cajaBySuc.get(s.id) ?? 0 }))

  const saldoByCuenta: Record<string, number> = {}
  for (const m of (movs ?? []) as any[]) saldoByCuenta[m.cuenta_bancaria_id] = (saldoByCuenta[m.cuenta_bancaria_id] ?? 0) + (m.tipo === 'ingreso' ? Number(m.monto) : m.tipo === 'egreso' ? -Number(m.monto) : 0)
  const cuentasBancarias: CuentaSaldo[] = ((cuentas ?? []) as any[]).map((c) => ({ id: c.id, nombre: c.nombre, banco: c.banco, saldo: saldoByCuenta[c.id] ?? 0 }))

  const rows: PagoRow[] = ((pagos ?? []) as any[]).map((p) => ({
    id: p.id, numero: p.numero_orden_pago, fecha: p.fecha_pago, total: Number(p.monto_total),
    neto: Number(p.monto_neto), retenciones: Number(p.retenciones_aplicadas), origen: p.origen_tipo ?? p.metodo_pago,
    estado: p.estado, proveedor: p.proveedores?.razon_social ?? '—',
  }))

  return (
    <>
      <PageHeader title="Pagos" description="Ejecutá pagos a proveedores moviendo dinero real desde un origen."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Pagos' }]} />
      <div className="p-4 md:p-6">
        <PagosClient pagos={rows} proveedores={((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social }))} sucursales={sucursales} cuentas={cuentasBancarias} />
      </div>
    </>
  )
}
