import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { ImpuestoObligacion } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'

import ImpuestosEditor from './editor'

export const dynamic = 'force-dynamic'

export default async function ImpuestosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('impuestos_obligaciones')
    .select('*')
    .order('fecha_vencimiento', { ascending: true })
    .limit(300)

  const rows = (rawRows ?? []) as ImpuestoObligacion[]
  const canWrite = ['super_admin', 'gerente', 'tesoreria', 'administrativo'].includes(
    profile.rol,
  )

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const en30 = new Date(hoy)
  en30.setDate(en30.getDate() + 30)

  const pendientes = rows.filter((r) => r.estado === 'pendiente' || r.estado === 'vencido')
  const proximas = pendientes.filter((r) => {
    const v = new Date(r.fecha_vencimiento)
    return v >= hoy && v <= en30
  })
  const vencidas = pendientes.filter((r) => new Date(r.fecha_vencimiento) < hoy)
  const montoPendiente = pendientes.reduce(
    (a, r) => a + Number(r.monto_real ?? r.monto_estimado ?? 0),
    0,
  )

  return (
    <>
      <PageHeader
        title="Calendario fiscal"
        description={`${rows.length} obligación${rows.length === 1 ? '' : 'es'} registrada${rows.length === 1 ? '' : 's'}`}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración <code>0022_finanzas_impuestos.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Pendientes" value={pendientes.length} />
            <KpiCard
              label="Vencen en 30d"
              value={proximas.length}
              variant={proximas.length > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              label="Vencidas"
              value={vencidas.length}
              variant={vencidas.length > 0 ? 'danger' : 'default'}
            />
            <KpiCard
              label="Monto pendiente"
              value={montoPendiente}
              format="currency"
            />
          </section>
        )}

        <ImpuestosEditor initial={rows} canWrite={canWrite} />
      </div>
    </>
  )
}
