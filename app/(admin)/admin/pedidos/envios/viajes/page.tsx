import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { ViajesClient } from './viajes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Viajes de reparto' }

const TABS = [
  { label: 'Zonas y tarifas', href: '/admin/pedidos/envios' },
  { label: 'Viajes', href: '/admin/pedidos/envios/viajes' },
]

/** Listos para salir: ya armados, de reparto propio, sin viaje asignado. */
const LISTOS = ['listo', 'confirmado', 'en_preparacion']

export default async function ViajesPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal'],
  })
  const sb = createClient()

  const [{ data: pendientes }, { data: sucursales }, { data: zonas }, { data: repartidores }] =
    await Promise.all([
      sb.from('orders')
        .select('id, codigo, status, customer_name, shipping_address, total, sucursal_id, zona_id, forma_entrega')
        .in('status', LISTOS).eq('forma_entrega', 'reparto_propio')
        .order('created_at').limit(300),
      sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('codigo'),
      sb.from('zonas_reparto').select('id, nombre, sucursal_id').eq('activa', true).order('nombre'),
      sb.from('users_pedidos').select('id, name, email').eq('role', 'repartidor').eq('active', true),
    ])

  // Los que ya están en un viaje no se pueden volver a poner en otro.
  const { filas: yaEnViaje } = await paginar<any>(
    sb.from('viaje_pedidos').select('order_id').order('order_id'), { maximo: 5000 },
  )
  const asignados = new Set(yaEnViaje.map((v) => v.order_id))

  const { filas: viajes } = await paginar<any>(
    sb.from('viajes_reparto')
      .select('id, fecha, estado, notas, salida_at, sucursal_id, zona_id, repartidor_id, sucursales(nombre), zonas_reparto(nombre), viaje_pedidos(order_id, orden, orders(codigo, customer_name, status))')
      .order('fecha', { ascending: false }),
    { maximo: 1000 },
  )

  return (
    <>
      <PageHeader
        title="Viajes de reparto"
        description="Agrupar pedidos de la misma zona, ponerlos en orden y asignarlos a un repartidor."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Envíos', href: '/admin/pedidos/envios' }, { label: 'Viajes' }]}
        tabs={TABS}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert>
          <AlertDescription className="text-xs leading-snug">
            <b>No hay ruta optimizada ni mapa.</b> El orden lo pone quien arma el viaje. Calcular el
            recorrido necesita un molde de direcciones que no existe, y los repartidores conocen la
            zona mejor que un algoritmo. Lo que falta para tener un mapa es geocodificar las
            direcciones de entrega: hoy son texto libre.
          </AlertDescription>
        </Alert>

        <ViajesClient
          pendientes={((pendientes ?? []) as any[]).filter((p) => !asignados.has(p.id))}
          sucursales={(sucursales ?? []) as any[]}
          zonas={(zonas ?? []) as any[]}
          repartidores={(repartidores ?? []) as any[]}
          viajes={viajes}
        />
      </div>
    </>
  )
}
