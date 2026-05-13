import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

import SucursalForm from '../sucursal-form'

export const dynamic = 'force-dynamic'

export default async function SucursalDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })
  const sb = createClient()

  const { data: s } = await sb
    .from('sucursales')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Sucursal>()
  if (!s) notFound()

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={s.nombre}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {s.codigo ? `Código ${s.codigo}` : 'Sin código interno'}
            {!s.activa && (
              <Badge variant="outline" className="ml-1">
                Inactiva
              </Badge>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Sucursales', href: '/hub/sucursales' },
          { label: s.nombre },
        ]}
      />

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <SucursalForm mode="edit" initial={s} />
      </div>
    </HubShell>
  )
}
