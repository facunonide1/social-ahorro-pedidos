import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { GastosFijosClient, type GastoRow, type InstanciaRow } from './gastos-fijos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gastos fijos' }

export default async function GastosFijosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: gastos }, { data: inst }, { data: sucs }, { data: provs }] = await Promise.all([
    sb.from('gastos_fijos').select('id, concepto, tipo, monto, frecuencia, dia_mes, activo, sucursal_id, proveedor_id, sucursales(nombre), proveedores(razon_social)').order('concepto'),
    sb.from('gastos_fijos_instancias').select('id, periodo, monto, estado, vencimiento, gasto_fijo_id, gastos_fijos(concepto)').order('vencimiento', { ascending: false }).limit(300),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
  ])

  const gastosRows: GastoRow[] = ((gastos ?? []) as any[]).map((g) => ({
    id: g.id, concepto: g.concepto, tipo: g.tipo, monto: g.monto != null ? Number(g.monto) : null,
    frecuencia: g.frecuencia, dia_mes: g.dia_mes, activo: g.activo,
    sucursal_id: g.sucursal_id, proveedor_id: g.proveedor_id,
    sucursal: g.sucursales?.nombre ?? null, proveedor: g.proveedores?.razon_social ?? null,
  }))
  const instRows: InstanciaRow[] = ((inst ?? []) as any[]).map((i) => ({
    id: i.id, periodo: i.periodo, monto: i.monto != null ? Number(i.monto) : 0, estado: i.estado,
    vencimiento: i.vencimiento, concepto: i.gastos_fijos?.concepto ?? '—',
  }))

  return (
    <>
      <PageHeader title="Gastos fijos" description="Gastos recurrentes mensuales (alquiler, servicios, seguros) que generan vencimientos automáticos. Los gastos variables del local van en Sucursales › Gastos operativos."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Gastos fijos' }]} />
      <div className="p-4 md:p-6">
        <GastosFijosClient
          gastos={gastosRows} instancias={instRows}
          sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre }))}
          proveedores={((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social }))}
        />
      </div>
    </>
  )
}
