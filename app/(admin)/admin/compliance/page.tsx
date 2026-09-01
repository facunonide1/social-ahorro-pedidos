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

  // ── ¿HAY CON QUE MIRAR? ───────────────────────────────────────────────────
  //
  // Esta pantalla decia «Compliance en orden: sin recalls, papeles al dia y
  // trazabilidad cargada» con CERO documentos, CERO recalls y CERO despachos
  // cargados. Es terreno legal (regla de oro 9): decir que esta todo en orden
  // cuando no hay nada contra que mirarlo es la afirmacion mas peligrosa del
  // sistema — es la que hace que nadie vaya a revisar (v0.86).
  const [{ count: nDocs }, { count: nRecalls }, { count: nDesp }] = await Promise.all([
    adm.from('compliance_documentos').select('id', { count: 'exact', head: true }),
    adm.from('compliance_recalls').select('id', { count: 'exact', head: true }),
    adm.from('compliance_despachos').select('id', { count: 'exact', head: true }),
  ])
  const hayPapeles = (nDocs ?? 0) > 0
  const hayRecalls = (nRecalls ?? 0) > 0
  const hayDespachos = (nDesp ?? 0) > 0
  const hayAlgo = hayPapeles || hayRecalls || hayDespachos
  const trazAtrasada = traz.filter((t) => t.dias >= 3)
  const peorTraz = traz.reduce((m, t) => Math.max(m, t.dias), 0)
  const score = !esTodas && sucursalId ? await scoreCompliance(adm, sucursalId) : null

  const kpis: SectorKpi[] = [
    { label: 'Recalls activos', value: hayRecalls ? recalls : null, icon: ShieldAlert, variant: recalls > 0 ? 'danger' : 'default', href: '/admin/compliance/recalls',
      nota: hayRecalls ? undefined : 'No hay ningún recall cargado: cero acá no quiere decir que no haya recalls, quiere decir que no se cargó ninguno.' },
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
    : !hayAlgo
    ? <p><b>No puedo decir si el compliance está en orden.</b> No hay ningún papel de habilitación, ningún recall ni ningún despacho de controlados cargado: no es que esté todo bien, es que no hay nada contra qué mirarlo. El libro recetario sigue siendo el registro legal, y esto no lo reemplaza.</p>
    : <p>Sin recalls activos{hayPapeles ? ', papeles al día' : ''}{hayDespachos ? ' y trazabilidad cargada' : ''}.{!hayPapeles && ' No hay papeles cargados, así que sobre eso no puedo decir nada.'} El libro recetario sigue siendo el registro legal.</p>

  return (
    <SectorDashboard title="Compliance" descripcion="El escudo de la habilitación: controlados, trazabilidad, papeles, recalls y procedimientos."
      breadcrumbs={[{ label: 'Compliance' }]} kpis={kpis} accesos={accesos} nora={nora} />
  )
}
