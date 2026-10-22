import { FileSignature, ShieldAlert, Percent } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Obras sociales' }

/**
 * OBRAS SOCIALES · LA ENTRADA DEL SECTOR.
 *
 * ── POR QUÉ NINGÚN KPI ARRANCA EN CERO ──────────────────────────────────────
 *
 * Porque hoy no hay un solo convenio cargado, y «0 débitos» se lee como «no te
 * debitaron nada». Lo que pasa es que no hay con qué mirarlo. Los KPI van en
 * null con el motivo (`nota`), que es lo que hace `SectorKpi` desde la v0.85.
 *
 * Es el mismo error que la pantalla de Compliance cometió hasta la v0.86,
 * cuando decía «compliance en orden» con cero documentos cargados.
 */
export default async function ConveniosPage() {
  await requireAdminHubAccess()
  const adm = createAdminClient()

  const { data: estado } = await adm.rpc('convenios_estado').maybeSingle<{
    total: number; activos: number
    sin_plazo_presentacion: number; sin_plazo_pago: number
    sin_cobertura: number; sin_requisitos: number; sin_contacto: number
  }>()

  const hayPadron = (estado?.total ?? 0) > 0

  const kpis: SectorKpi[] = [
    {
      label: 'Convenios activos',
      value: hayPadron ? (estado?.activos ?? 0) : null,
      icon: FileSignature,
      href: '/admin/convenios/padron',
      nota: hayPadron ? undefined
        : 'No hay ningún convenio cargado. Entre el 50% y el 70% de lo que se despacha pasa por una obra social: hasta que el padrón tenga algo, este sector no puede decir nada.',
    },
    {
      label: 'Sin plazo de presentación',
      value: hayPadron ? (estado?.sin_plazo_presentacion ?? 0) : null,
      icon: Percent,
      variant: (estado?.sin_plazo_presentacion ?? 0) > 0 ? 'warning' : 'default',
      href: '/admin/convenios/padron',
      nota: hayPadron ? undefined : 'Sin padrón no hay plazos que revisar.',
    },
    {
      label: 'Sin saber qué exigen',
      value: hayPadron ? (estado?.sin_requisitos ?? 0) : null,
      icon: ShieldAlert,
      variant: (estado?.sin_requisitos ?? 0) > 0 ? 'warning' : 'default',
      href: '/admin/convenios/padron',
      nota: hayPadron ? undefined : 'Las exigencias de cada convenio son las reglas que explican los débitos.',
    },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Padrón', href: '/admin/convenios/padron', icon: FileSignature,
      descripcion: 'Qué cubre cada convenio, en qué plazo se presenta y qué exige' },
  ]

  const nora = !hayPadron
    ? <p><b>No puedo decir nada todavía.</b> No hay ningún convenio cargado, así que no puedo
        avisar antes de un cierre de presentación ni decir si un débito se puede reclamar. Lo que
        me enciende es la lista de obras sociales con las que trabajan y el plazo de presentación
        de cada una.</p>
    : (estado?.sin_plazo_presentacion ?? 0) > 0
    ? <p>Hay <b>{estado?.sin_plazo_presentacion}</b> convenio(s) sin plazo de presentación cargado.
        Sin ese dato no puedo avisar antes del cierre: el aviso no es que no suene a tiempo, es
        que no existe.</p>
    : <p>El padrón tiene {estado?.activos} convenio(s) activo(s) con sus plazos cargados.</p>

  return (
    <SectorDashboard
      title="Obras sociales"
      descripcion="Presentación y débitos: lo que pasa después de que SIFACO factura."
      breadcrumbs={[{ label: 'Obras sociales' }]}
      kpis={kpis} accesos={accesos} nora={nora}
    />
  )
}
