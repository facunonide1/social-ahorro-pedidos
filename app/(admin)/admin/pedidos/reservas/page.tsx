import { PackageX, Clock, AlertTriangle } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { horasDeReserva } from '@/lib/pedidos/reserva'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reservas de stock' }

/**
 * QUÉ ESTÁ BLOQUEADO Y HASTA CUÁNDO.
 *
 * La pantalla dice las tres limitaciones en lugar de esconderlas: la reserva no
 * protege contra el mostrador, pesa sobre el stock consolidado y el stock es una
 * foto del archivo diario.
 */
export default async function ReservasPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero', 'auditor'],
  })
  const sb = createClient()
  const horas = await horasDeReserva()

  // Las que se pasaron de plazo se marcan cuando alguien mira, no desde un
  // trigger: un update disparado por una lectura es una escritura invisible.
  await sb.rpc('reservas_vencer')

  const { filas: activas } = await paginar<any>(
    sb.from('reservas_stock')
      .select('id, sku, cantidad, vence_at, created_at, order_id, producto_id, orders(codigo, status, origin), productos_catalogo(nombre)')
      .eq('estado', 'activa')
      .order('vence_at'),
    { maximo: 2000 },
  )

  const productoIds = [...new Set(activas.map((r) => r.producto_id))].slice(0, 200)
  const { data: disponibles } = productoIds.length
    ? await sb.from('stock_disponible')
        .select('producto_id, stock, reservado, disponible, sobrevendido')
        .in('producto_id', productoIds).limit(200)
    : { data: [] as any[] }

  const porProducto = new Map<string, any>((disponibles ?? []).map((d: any) => [d.producto_id, d]))
  const sobrevendidos = (disponibles ?? []).filter((d: any) => Number(d.sobrevendido) > 0)
  const unidades = activas.reduce((a, r) => a + Number(r.cantidad), 0)

  const enUnDia = activas.filter(
    (r) => new Date(r.vence_at).getTime() - Date.now() < 86_400_000,
  ).length

  return (
    <>
      <PageHeader
        title="Reservas de stock"
        description="Unidades bloqueadas por pedidos abiertos, para que dos canales no vendan la misma."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Reservas' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert>
          <AlertDescription className="space-y-1.5 text-xs leading-snug">
            <p>
              <b>Esto protege entre canales, no contra el mostrador.</b> El stock que tiene NORA es
              la foto del archivo diario de SIFACO: entre archivo y archivo se vende en el local y
              acá no se entera.
            </p>
            <p>
              <b>Y la reserva pesa sobre el total de las cuatro sucursales.</b> El stock no está
              abierto por local —falta el archivo <code>tabla3e</code> completo—, así que una reserva
              puede estar bloqueando una unidad que físicamente está en otra sucursal. Se resuelve
              solo el día que llegue ese archivo.
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Reservas activas" value={activas.length} icon={PackageX} />
          <KpiCard label="Unidades bloqueadas" value={unidades} icon={PackageX} />
          <KpiCard label="Vencen en menos de 24 h" value={enUnDia} icon={Clock}
            variant={enUnDia > 0 ? 'warning' : 'default'}
            footer={`El plazo es de ${horas} horas desde que entra el pedido.`} />
          <KpiCard label="Productos sobrevendidos" value={sobrevendidos.length} icon={AlertTriangle}
            variant={sobrevendidos.length > 0 ? 'danger' : 'default'}
            footer={sobrevendidos.length > 0 ? 'Hay más prometido que stock declarado.' : undefined} />
        </div>

        {activas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay reservas activas. Cuando entre un pedido, sus unidades quedan bloqueadas
            hasta que se despache o se cancele.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2 text-right">Reservado</th>
                  <th className="px-3 py-2 text-right">Stock SIFACO</th>
                  <th className="px-3 py-2 text-right">Disponible</th>
                  <th className="px-3 py-2">Vence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activas.map((r) => {
                  const d = porProducto.get(r.producto_id)
                  const vence = new Date(r.vence_at)
                  const pronto = vence.getTime() - Date.now() < 86_400_000
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.productos_catalogo?.nombre ?? '—'}</div>
                        {r.sku && <div className="text-xs text-muted-foreground">SKU {r.sku}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div>{r.orders?.codigo ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.orders?.status}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.cantidad)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {d?.stock == null ? 'sin dato' : Number(d.stock)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d?.disponible == null ? 'sin dato' : Number(d.disponible)}
                        {Number(d?.sobrevendido ?? 0) > 0 && (
                          <Badge variant="destructive" className="ml-1 text-[10px]">
                            −{Number(d.sobrevendido)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={pronto ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                          {vence.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
