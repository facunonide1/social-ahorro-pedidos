import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { TicketValidacion } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TicketsClient } from './client'

export const dynamic = 'force-dynamic'

const PRIORIDAD_ESTADO: Record<string, number> = {
  dudoso: 0,
  pendiente: 1,
  auto_validado: 2,
  manual_aprobado: 3,
  rechazado: 4,
}

export type TicketConUrl = TicketValidacion & { foto_signed_url: string | null }

export default async function TicketsPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo'],
  })
  const sb = createClient()

  const { data, error } = await sb
    .from('tickets_validacion')
    .select('*')
    .order('fecha_carga', { ascending: false })
    .limit(60)

  const tickets = (data ?? []) as TicketValidacion[]

  // Signed URLs para las fotos (bucket privado).
  let ticketsConUrl: TicketConUrl[] = tickets.map((t) => ({
    ...t,
    foto_signed_url: null,
  }))
  if (tickets.length > 0) {
    try {
      const admin = createAdminClient()
      const { data: signed } = await admin.storage
        .from('tickets-validacion')
        .createSignedUrls(
          tickets.map((t) => t.foto_url),
          3600,
        )
      if (signed) {
        ticketsConUrl = tickets.map((t, i) => ({
          ...t,
          foto_signed_url: signed[i]?.signedUrl ?? null,
        }))
      }
    } catch {
      // si falla el firmado, la UI muestra el ticket sin imagen
    }
  }

  ticketsConUrl.sort((a, b) => {
    const pa = PRIORIDAD_ESTADO[a.estado] ?? 9
    const pb = PRIORIDAD_ESTADO[b.estado] ?? 9
    if (pa !== pb) return pa - pb
    return b.fecha_carga.localeCompare(a.fecha_carga)
  })

  const pendientes = tickets.filter((t) =>
    ['pendiente', 'dudoso'].includes(t.estado),
  ).length
  const aprobados = tickets.filter((t) =>
    ['manual_aprobado', 'auto_validado'].includes(t.estado),
  ).length
  const rechazados = tickets.filter((t) => t.estado === 'rechazado').length

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Validación de tickets"
        description="Cargá la foto de un ticket y la IA extrae los datos. Después revisás y validás."
        breadcrumbs={[{ label: 'IA' }, { label: 'Tickets' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>0027_ia_aprobaciones_tickets.sql</code> y{' '}
                  <code>0028_tickets_validacion_bucket.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Total cargados" value={tickets.length} />
            <KpiCard
              label="Por revisar"
              value={pendientes}
              variant={pendientes > 0 ? 'warning' : 'default'}
            />
            <KpiCard label="Aprobados" value={aprobados} variant="success" />
            <KpiCard
              label="Rechazados"
              value={rechazados}
              variant={rechazados > 0 ? 'danger' : 'default'}
            />
          </section>
        )}

        {!error && (
          <TicketsClient initialTickets={ticketsConUrl} userId={profile.id} />
        )}
      </div>
    </HubShell>
  )
}
