import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'

import { CajaClient, type SucCajaConfig, type TurnoRow, type MovRow } from './caja-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Caja' }

export default async function CajaPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'sucursal', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let cajasQ = sb.from('caja_general').select('sucursal_id, saldo_actual').eq('tipo', 'caja_general')
  let turnosQ = sb.from('caja_turnos').select('id, sucursal_id, fecha, apertura, ventas_efectivo, pagos_efectivo, esperado, contado, diferencia, fondo_dejado, retiro_a_general, estado, sucursales(nombre)').order('fecha', { ascending: false }).limit(80)
  if (!esTodas && sucursalId) { cajasQ = cajasQ.eq('sucursal_id', sucursalId); turnosQ = turnosQ.eq('sucursal_id', sucursalId) }

  const [{ data: sucs }, { data: cfg }, { data: cajas }, { data: turnos }, { data: movs }] = await Promise.all([
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb.from('config_caja_sucursal').select('sucursal_id, fondo_fijo, usa_caja_general, usa_caja_fuerte'),
    cajasQ,
    turnosQ,
    sb.from('caja_general_movimientos').select('id, tipo, monto, estado, notas, fecha, caja_general_id, caja_general(sucursal_id, sucursales(nombre))').order('fecha', { ascending: false }).limit(120),
  ])

  const cfgBySuc = new Map(((cfg ?? []) as any[]).map((c) => [c.sucursal_id, c]))
  const cajaBySuc = new Map(((cajas ?? []) as any[]).map((c) => [c.sucursal_id, Number(c.saldo_actual)]))
  const sucursales: SucCajaConfig[] = ((sucs ?? []) as any[]).map((s) => ({
    id: s.id, nombre: s.nombre,
    fondo_fijo: Number(cfgBySuc.get(s.id)?.fondo_fijo ?? 0),
    usa_caja_general: cfgBySuc.get(s.id)?.usa_caja_general ?? true,
    usa_caja_fuerte: cfgBySuc.get(s.id)?.usa_caja_fuerte ?? false,
    saldo_general: cajaBySuc.get(s.id) ?? 0,
  }))

  const turnoRows: TurnoRow[] = ((turnos ?? []) as any[]).map((t) => ({
    id: t.id, sucursal: t.sucursales?.nombre ?? '—', fecha: t.fecha, apertura: Number(t.apertura ?? 0),
    ventas: Number(t.ventas_efectivo ?? 0), pagos: Number(t.pagos_efectivo ?? 0),
    esperado: t.esperado != null ? Number(t.esperado) : null, contado: t.contado != null ? Number(t.contado) : null,
    diferencia: t.diferencia != null ? Number(t.diferencia) : null, fondo_dejado: t.fondo_dejado != null ? Number(t.fondo_dejado) : null,
    retiro: t.retiro_a_general != null ? Number(t.retiro_a_general) : null, estado: t.estado,
  }))

  const movRows: MovRow[] = ((movs ?? []) as any[]).map((m) => ({
    id: m.id, tipo: m.tipo, monto: Number(m.monto), estado: m.estado, notas: m.notas, fecha: m.fecha,
    sucursal: m.caja_general?.sucursales?.nombre ?? '—',
  }))

  return (
    <>
      <PageHeader title="Caja" description="Caja del turno → caja general → retiros, con arqueo ciego y aprobaciones."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Caja' }]} />
      <div className="p-4 md:p-6">
        <CajaClient rol={profile.rol} sucursales={sucursales} turnos={turnoRows} movimientos={movRows} />
      </div>
    </>
  )
}
