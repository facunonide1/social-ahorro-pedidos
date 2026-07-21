import { ShieldAlert, FileBadge, ClipboardCheck, ShieldCheck, FileText, Pill } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { recallsActivos, papelesEnAlerta, diasSinTrazabilidad, scoreCompliance } from '@/lib/compliance/helpers'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compliance' }

export default async function CompliancePage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal', 'rrhh'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const [recalls, papeles, traz] = await Promise.all([recallsActivos(adm), papelesEnAlerta(adm, 30), diasSinTrazabilidad(adm)])
  const trazAtrasada = traz.filter((t) => t.dias >= 3)
  const peorTraz = traz.reduce((m, t) => Math.max(m, t.dias), 0)
  const score = !esTodas && sucursalId ? await scoreCompliance(adm, sucursalId) : null

  const kpis: SectorKpi[] = [
    { label: 'Recalls activos', value: recalls, icon: ShieldAlert, variant: recalls > 0 ? 'danger' : 'default', href: '/admin/compliance/recalls' },
    { label: 'Papeles por vencer', value: papeles.length, icon: FileBadge, variant: papeles.some((p) => p.dias < 0) ? 'danger' : papeles.length > 0 ? 'warning' : 'default', href: '/admin/compliance/papeles' },
    { label: 'Traz. atrasada (suc.)', value: trazAtrasada.length, icon: ClipboardCheck, variant: trazAtrasada.length > 0 ? 'warning' : 'default', href: '/admin/compliance/despachos' },
    ...(score != null ? [{ label: 'Score de compliance', value: score, icon: ShieldCheck, variant: (score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger') as any }] : []),
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Despachos', href: '/admin/compliance/despachos', icon: ShieldCheck, descripcion: 'Registro de controlados por turno' },
    { label: 'Controlados', href: '/admin/compliance/controlados', icon: Pill, descripcion: 'Marcar productos II/III/IV' },
    { label: 'Papeles', href: '/admin/compliance/papeles', icon: FileBadge, descripcion: 'Habilitación, seguro, matafuegos…' },
    { label: 'Recalls', href: '/admin/compliance/recalls', icon: ShieldAlert },
    { label: 'SOPs', href: '/admin/compliance/sops', icon: FileText },
  ]

  const nora = recalls > 0
    ? <p>🔴 Hay <b>{recalls}</b> recall(s) activo(s). Verificá que el retiro esté completo en todas las sucursales antes de cerrarlos.</p>
    : papeles.some((p) => p.dias < 0)
    ? <p>⚠️ Papeles VENCIDOS: revisá {papeles.filter((p) => p.dias < 0).length} documento(s) de sucursal.</p>
    : trazAtrasada.length > 0
    ? <p>La trazabilidad ANMAT está atrasada en <b>{trazAtrasada.length}</b> sucursal(es) (peor: {peorTraz} días). Es tarea diaria con screenshot.</p>
    : <p>Compliance en orden: sin recalls, papeles al día y trazabilidad cargada. El libro recetario sigue siendo el registro legal.</p>

  return (
    <SectorDashboard title="Compliance" descripcion="El escudo de la habilitación: controlados, trazabilidad, papeles, recalls y procedimientos."
      breadcrumbs={[{ label: 'Compliance' }]} kpis={kpis} accesos={accesos} nora={nora} />
  )
}
