import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { coberturaSemana, horasDescubiertasSemana, lunesDe, sumarDiasISO } from '@/lib/personas/cobertura'
import { PageHeader } from '@/components/shared/page-header'
import { GrillaClient } from './grilla-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Grilla y cobertura' }

export default async function GrillaPage({ searchParams }: { searchParams: { suc?: string; w?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const adm = createAdminClient()

  const { data: sucs } = await adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
  const sucursales = (sucs ?? []) as { id: string; nombre: string }[]
  const { sucursalId: sucActiva, esTodas } = getSucursalActiva()
  const sucursalId = (searchParams?.suc && sucursales.some((s) => s.id === searchParams.suc)) ? searchParams.suc
    : (!esTodas && sucActiva && sucursales.some((s) => s.id === sucActiva)) ? sucActiva
    : sucursales[0]?.id ?? null

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const week = searchParams?.w ? lunesDe(searchParams.w) : lunesDe(hoy)

  let cobertura = null, prevHoras = 0
  if (sucursalId) {
    cobertura = await coberturaSemana(adm, sucursalId, week)
    prevHoras = await horasDescubiertasSemana(adm, sucursalId, sumarDiasISO(week, -7))
  }

  return (
    <>
      <PageHeader title="Grilla y cobertura farmacéutica" description="Quién está por franja y dónde falta un farmacéutico. Regla de Compliance: sin farmacéutico presente no se despacha."
        breadcrumbs={[{ label: 'Personas', href: '/admin/rrhh' }, { label: 'Grilla' }]} />
      <div className="p-4 md:p-6">
        {!sucursalId ? (
          <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">No hay sucursales activas.</div>
        ) : (
          <GrillaClient sucursales={sucursales} sucursalId={sucursalId} week={week} cobertura={cobertura!} prevHoras={prevHoras} />
        )}
      </div>
    </>
  )
}
