import { Sparkles, Ticket, FileText } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'
import { AccionesSubApp } from '@/components/os/acciones-subapp'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inteligencia / IA' }

export default async function IaDashboard() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const sb = createClient()
  const en7 = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [{ count: pendientes }, { count: dudosos }, { count: recientes }] = await Promise.all([
    sb.from('tickets_validacion').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    sb.from('tickets_validacion').select('id', { count: 'exact', head: true }).eq('estado', 'dudoso'),
    sb.from('tickets_validacion').select('id', { count: 'exact', head: true }).gte('fecha_carga', en7),
  ])

  const kpis: SectorKpi[] = [
    { label: 'Tickets a validar', value: pendientes ?? 0, icon: Ticket, variant: (pendientes ?? 0) > 0 ? 'warning' : 'default', href: '/admin/ia/tickets' },
    { label: 'Dudosos', value: dudosos ?? 0, icon: Ticket, variant: (dudosos ?? 0) > 0 ? 'warning' : 'default', href: '/admin/ia/tickets' },
    { label: 'Cargados (7 días)', value: recientes ?? 0, icon: Sparkles, href: '/admin/ia/tickets' },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Validación de tickets', href: '/admin/ia/tickets', icon: Ticket, descripcion: 'OCR + puntos' },
    { label: 'Resumen IA del día', href: '/admin/ia/resumen', icon: Sparkles },
    { label: 'BI / Reportes', href: '/admin/bi', icon: FileText, descripcion: 'Análisis profundo' },
  ]

  const nora = (pendientes ?? 0) + (dudosos ?? 0) > 0
    ? <p>Hay <b>{(pendientes ?? 0) + (dudosos ?? 0)}</b> tickets esperando validación ({pendientes ?? 0} pendientes, {dudosos ?? 0} dudosos).</p>
    : <p>Sin tickets pendientes de validación. Se cargaron <b>{recientes ?? 0}</b> en los últimos 7 días.</p>

  return (
    <SectorDashboard
      title="Inteligencia / IA"
      descripcion="Validación de tickets, resúmenes y análisis asistido por NORA."
      breadcrumbs={[{ label: 'Inteligencia' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
      acciones={<AccionesSubApp app="inteligencia" />}
    />
  )
}
