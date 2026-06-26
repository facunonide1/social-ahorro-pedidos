import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { TransferenciasClient, type TransferRow } from './transferencias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Transferencias' }

export default async function TransferenciasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let q = adm.from('transferencias_sucursal')
    .select('id, estado, sucursal_origen_id, sucursal_destino_id, fecha_solicitud, fecha_envio, fecha_recepcion, diferencia_detectada')
    .order('created_at', { ascending: false }).limit(120)
  if (!esTodas && sucursalId) q = q.or(`sucursal_origen_id.eq.${sucursalId},sucursal_destino_id.eq.${sucursalId}`)

  const [{ data }, { data: sucs }, { data: items }] = await Promise.all([
    q,
    adm.from('sucursales').select('id, nombre').order('nombre'),
    adm.from('transferencia_items').select('transferencia_id'),
  ])
  const nombreSuc = new Map<string, string>(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const conteo = new Map<string, number>()
  for (const it of (items ?? []) as any[]) conteo.set(it.transferencia_id, (conteo.get(it.transferencia_id) ?? 0) + 1)

  const rows: TransferRow[] = ((data ?? []) as any[]).map((t) => {
    const horas = t.estado === 'en_transito' && t.fecha_envio ? (Date.now() - new Date(t.fecha_envio).getTime()) / 3.6e6 : null
    return {
      id: t.id, estado: t.estado, origen: nombreSuc.get(t.sucursal_origen_id) ?? '—', destino: nombreSuc.get(t.sucursal_destino_id) ?? '—',
      nItems: conteo.get(t.id) ?? 0, fecha_solicitud: t.fecha_solicitud, fecha_envio: t.fecha_envio,
      fecha_recepcion: t.fecha_recepcion, diferencia_detectada: !!t.diferencia_detectada, horas_transito: horas,
    }
  })
  const sinRecibir = rows.filter((r) => r.estado === 'en_transito' && (r.horas_transito ?? 0) > 48).length

  return (
    <>
      <PageHeader title="Transferencias entre sucursales"
        description="Triple control con foto: se crea → sale (descuenta origen) → se recibe (suma destino)."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Transferencias' }]} />
      <div className="p-4 md:p-6">
        <TransferenciasClient rows={rows} sucursales={(sucs ?? []) as any} sucursalActiva={sucursalId} sinRecibir={sinRecibir} />
      </div>
    </>
  )
}
