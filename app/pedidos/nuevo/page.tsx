import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Order, UserPedidos, ZonaReparto } from '@/lib/types'

import { CrmShell } from '@/components/crm/crm-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import NuevoPedidoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: { from?: string }
}) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const { data: zonas } = await sb
    .from('zonas_reparto')
    .select('id, nombre, color, activa')
    .eq('activa', true)
    .order('nombre', { ascending: true })
    .returns<Pick<ZonaReparto, 'id' | 'nombre' | 'color' | 'activa'>[]>()

  let source: Order | null = null
  if (searchParams.from) {
    const { data } = await sb
      .from('orders')
      .select('*')
      .eq('id', searchParams.from)
      .maybeSingle<Order>()
    source = data ?? null
  }

  return (
    <CrmShell>
      <PageHeader
        title="Nuevo pedido manual"
        description="Para pedidos que entran por WhatsApp, teléfono u otros canales."
        breadcrumbs={[{ label: 'Pedidos', href: '/pedidos' }, { label: 'Nuevo' }]}
      />
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        {source && (
          <Alert variant="info">
            <AlertDescription>
              Repitiendo pedido <b>{source.codigo}</b>. Los datos se precargaron; podés
              ajustar lo que haga falta antes de confirmar.
            </AlertDescription>
          </Alert>
        )}
        <NuevoPedidoForm zonas={zonas ?? []} source={source} />
      </div>
    </CrmShell>
  )
}
