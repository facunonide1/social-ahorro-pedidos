import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ArmarPedidoClient } from './armar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Armar un pedido' }

/**
 * LA PANTALLA QUE SE VA A USAR TODOS LOS DÍAS.
 *
 * El caso principal es WhatsApp: hoy se carga a mano o no se carga, y es donde
 * más información se pierde. Un pedido cargado a mano necesita exactamente lo
 * mismo que uno automático — cliente, productos, sucursal y forma de entrega—,
 * así que la pantalla los pide todos.
 */
export default async function ArmarPedidoPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero'],
  })
  const sb = createClient()

  const { data: sucursales } = await sb
    .from('sucursales').select('id, nombre, codigo, es_ecommerce')
    .eq('activa', true).order('codigo')

  return (
    <>
      <PageHeader
        title="Armar un pedido"
        description="Cliente, productos, sucursal y forma de entrega. El canal es un campo: el mismo pedido sirve para WhatsApp, mostrador o PedidosYa."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Armar un pedido' }]}
      />
      <div className="p-4 md:p-6">
        <ArmarPedidoClient sucursales={(sucursales ?? []) as any[]} />
      </div>
    </>
  )
}
