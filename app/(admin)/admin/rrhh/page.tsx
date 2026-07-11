import { Users, UserX, Building2, Trophy, CalendarDays } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'
import { AccionesSubApp } from '@/components/os/acciones-subapp'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Equipo / RRHH' }

export default async function RrhhDashboard() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const hoy = new Date().toISOString().slice(0, 10)

  let activosQ = sb.from('empleados').select('id', { count: 'exact', head: true }).eq('activo', true)
  if (!esTodas && sucursalId) activosQ = activosQ.eq('sucursal_id', sucursalId)

  const [{ count: activos }, { count: ausentes }, { count: sucs }] = await Promise.all([
    activosQ,
    sb.from('empleado_ausencias').select('id', { count: 'exact', head: true }).lte('fecha_desde', hoy).gte('fecha_hasta', hoy),
    sb.from('sucursales').select('id', { count: 'exact', head: true }).eq('activa', true),
  ])

  const kpis: SectorKpi[] = [
    { label: 'Empleados activos', value: activos ?? 0, icon: Users, href: '/admin/rrhh/empleados' },
    { label: 'Ausentes hoy', value: ausentes ?? 0, icon: UserX, variant: (ausentes ?? 0) > 0 ? 'warning' : 'default', href: '/admin/rrhh/empleados' },
    { label: 'Sucursales', value: sucs ?? 0, icon: Building2, href: '/admin/sucursales' },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Empleados', href: '/admin/rrhh/empleados', icon: Users, descripcion: 'Legajos, ausencias, turnos' },
    { label: 'Mi equipo', href: '/admin/mi-equipo', icon: Users },
    { label: 'Ranking', href: '/admin/ranking', icon: Trophy },
    { label: 'Objetivos', href: '/admin/objetivos', icon: CalendarDays },
    { label: 'Performance', href: '/admin/sucursales/performance', icon: Trophy },
  ]

  const nora = (ausentes ?? 0) > 0
    ? <p>Hay <b>{ausentes}</b> ausencias registradas para hoy sobre <b>{activos ?? 0}</b> empleados activos — revisá la cobertura de turnos.</p>
    : <p>Equipo completo hoy: <b>{activos ?? 0}</b> empleados activos sin ausencias registradas.</p>

  return (
    <SectorDashboard
      title="Equipo / RRHH"
      descripcion="Empleados, turnos, desempeño y objetivos."
      breadcrumbs={[{ label: 'Equipo' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
      acciones={<AccionesSubApp app="personas" />}
    />
  )
}
