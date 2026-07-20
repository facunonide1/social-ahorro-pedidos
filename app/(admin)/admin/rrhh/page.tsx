import { Users, UserX, Building2, Trophy, CalendarDays, Pill, CalendarClock } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { horasDescubiertasSemana, sucursalesEnRiesgo, lunesDe } from '@/lib/personas/cobertura'
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

  // Cobertura farmacéutica (OS-5a): horas descubiertas de la semana.
  const adm = createAdminClient()
  const week = lunesDe(hoy)
  const horasDesc = !esTodas && sucursalId ? await horasDescubiertasSemana(adm, sucursalId, week) : null
  const riesgo = await sucursalesEnRiesgo(adm, week)

  const kpis: SectorKpi[] = [
    { label: 'Empleados activos', value: activos ?? 0, icon: Users, href: '/admin/rrhh/empleados' },
    { label: 'Ausentes hoy', value: ausentes ?? 0, icon: UserX, variant: (ausentes ?? 0) > 0 ? 'warning' : 'default', href: '/admin/rrhh/empleados' },
    { label: horasDesc != null ? 'Horas sin farmacéutico (sem)' : 'Sucursales en riesgo', value: horasDesc != null ? horasDesc : riesgo.length, icon: Pill, variant: (horasDesc != null ? horasDesc > 0 : riesgo.length > 0) ? 'danger' : 'default', href: '/admin/rrhh/grilla' },
    { label: 'Sucursales', value: sucs ?? 0, icon: Building2, href: '/admin/sucursales' },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Empleados', href: '/admin/rrhh/empleados', icon: Users, descripcion: 'Legajos, ausencias, turnos' },
    { label: 'Grilla y cobertura', href: '/admin/rrhh/grilla', icon: CalendarClock, descripcion: 'Quién cubre y dónde falta farmacéutico' },
    { label: 'Ausencias', href: '/admin/rrhh/ausencias', icon: CalendarDays },
    { label: 'Mi equipo', href: '/admin/mi-equipo', icon: Users },
    { label: 'Ranking', href: '/admin/ranking', icon: Trophy },
    { label: 'Objetivos', href: '/admin/objetivos', icon: CalendarDays },
  ]

  const nora = riesgo.length > 0
    ? <p>⚠️ Cobertura en riesgo: <b>{riesgo[0].nombre}</b> tiene <b>{riesgo[0].horas}h</b> sin farmacéutico esta semana (umbral {riesgo[0].umbral}h){riesgo.length > 1 ? ` y ${riesgo.length - 1} sucursal(es) más` : ''}. <a href="/admin/rrhh/grilla" className="text-primary hover:underline">Ver la grilla →</a></p>
    : (ausentes ?? 0) > 0
    ? <p>Hay <b>{ausentes}</b> ausencias registradas para hoy sobre <b>{activos ?? 0}</b> empleados activos — revisá la cobertura de turnos.</p>
    : <p>Equipo completo hoy: <b>{activos ?? 0}</b> empleados activos y sin franjas descubiertas.</p>

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
