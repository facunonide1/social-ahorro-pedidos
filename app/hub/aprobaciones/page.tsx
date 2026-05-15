import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Aprobacion } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AprobacionesList, NuevaAprobacionButton } from './client'

export const dynamic = 'force-dynamic'

const PENDIENTE_ESTADOS = ['pendiente', 'solicita_info']

export default async function AprobacionesPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const { data, error } = await sb
    .from('aprobaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(120)

  const aprobaciones = (data ?? []) as Aprobacion[]
  const canResolve = ['super_admin', 'gerente'].includes(profile.rol)
  const tab = searchParams.tab === 'resueltas' ? 'resueltas' : 'pendientes'

  const pendientes = aprobaciones.filter((a) =>
    PENDIENTE_ESTADOS.includes(a.estado),
  )
  const resueltas = aprobaciones.filter(
    (a) => !PENDIENTE_ESTADOS.includes(a.estado),
  )
  const visibles = tab === 'pendientes' ? pendientes : resueltas

  const montoPendiente = pendientes.reduce(
    (a, x) => a + Number(x.monto_afectado || 0),
    0,
  )
  const aprobadas = aprobaciones.filter((a) => a.estado === 'aprobada').length

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Centro de aprobaciones"
        description="Solicitudes que requieren visto bueno de gerencia"
        breadcrumbs={[{ label: 'Aprobaciones' }]}
        actions={
          canResolve ? <NuevaAprobacionButton userId={profile.id} /> : undefined
        }
        tabs={[
          {
            label: 'Pendientes',
            href: '/hub/aprobaciones',
            active: tab === 'pendientes',
            badge: pendientes.length,
          },
          {
            label: 'Resueltas',
            href: '/hub/aprobaciones?tab=resueltas',
            active: tab === 'resueltas',
            badge: resueltas.length,
          },
        ]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>0027_ia_aprobaciones_tickets.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard
              label="Pendientes"
              value={pendientes.length}
              variant={pendientes.length > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              label="Monto en revisión"
              value={montoPendiente}
              format="currency"
            />
            <KpiCard label="Aprobadas (histórico)" value={aprobadas} />
          </section>
        )}

        {!error && (
          <AprobacionesList
            initial={visibles}
            canResolve={canResolve}
            userId={profile.id}
          />
        )}
      </div>
    </HubShell>
  )
}
