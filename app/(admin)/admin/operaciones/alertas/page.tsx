import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'

import { AlertasClient, type AlertaRow } from './alertas-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alertas' }

export default async function AlertasPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let alertasQ = sb.from('alertas_stock').select('id, tipo, severidad, datos, producto_id, sucursal_id, created_at').eq('estado', 'activa').order('severidad').order('created_at', { ascending: false }).limit(500)
  if (!esTodas && sucursalId) alertasQ = alertasQ.eq('sucursal_id', sucursalId)

  const [{ data: alertas }, { data: sucs }] = await Promise.all([
    alertasQ,
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const rows = (alertas ?? []) as AlertaRow[]
  const esSuper = ['super_admin', 'gerente'].includes(profile.rol)

  return (
    <>
      <PageHeader title="Alertas de stock" description="Quiebres, sobrestock, sin rotación, stock fantasma y vencimientos."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Alertas' }]} />
      <div className="p-4 md:p-6">
        <AlertasClient alertas={rows} sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre }))} puedeRegenerar={esSuper} />
      </div>
    </>
  )
}
