import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, TIPO_ENVIO_LABELS } from '@/lib/types'
import type { Order, UserPedidos } from '@/lib/types'
import { formatAddress } from '@/lib/address'

import { Button } from '@/components/ui/button'
import PrintButton from './print-button'

export const dynamic = 'force-dynamic'

export default async function RemitoPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')

  const { data: order } = await sb
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Order>()
  if (!order) notFound()

  const addr = formatAddress(order.shipping_address) || formatAddress(order.billing_address)
  const subtotal = order.items.reduce(
    (a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0,
  )

  return (
    <div className="min-h-screen bg-muted/40 text-foreground print:bg-white">
      {/* Barra superior (no se imprime) */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-5 py-3 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/pedidos/${order.id}`}>
            <ArrowLeft className="size-4" />
            Volver al pedido
          </Link>
        </Button>
        <PrintButton />
      </div>

      {/* Hoja del remito */}
      <main className="sa-remito-sheet mx-auto my-5 max-w-2xl bg-white p-8 text-black shadow-lg print:my-0 print:max-w-full print:p-[16mm] print:shadow-none">
        <header className="mb-5 flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="size-3 rounded-full bg-primary" aria-hidden />
              <span className="text-xl font-extrabold tracking-tight">Social Ahorro</span>
            </div>
            <div className="text-xs text-neutral-600">socialahorro.com · Farmacia</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Remito
            </div>
            <div className="text-2xl font-extrabold tabular-nums tracking-tight">
              {order.codigo}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-600">
              {new Date(order.woo_created_at || order.created_at).toLocaleString('es-AR')}
            </div>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-5">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Cliente
            </div>
            <div className="text-base font-bold">{order.customer_name || '—'}</div>
            <div className="mt-0.5 text-xs text-neutral-700">
              {order.customer_phone || ''}
              {order.customer_phone && order.customer_email ? ' · ' : ''}
              {order.customer_email || ''}
            </div>
            {order.customer_dni && (
              <div className="text-xs text-neutral-700">DNI {order.customer_dni}</div>
            )}
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Entrega
            </div>
            <div className="text-sm">
              <b>{TIPO_ENVIO_LABELS[order.tipo_envio]}</b> · {STATUS_LABELS[order.status]}
            </div>
            {addr && <div className="mt-0.5 text-xs text-neutral-700">{addr}</div>}
          </div>
        </section>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="px-1.5 py-2 text-left text-[10px] uppercase tracking-wider text-neutral-600">
                Producto
              </th>
              <th className="px-1.5 py-2 text-center text-[10px] uppercase tracking-wider text-neutral-600">
                Cant.
              </th>
              <th className="px-1.5 py-2 text-right text-[10px] uppercase tracking-wider text-neutral-600">
                P. unit.
              </th>
              <th className="px-1.5 py-2 text-right text-[10px] uppercase tracking-wider text-neutral-600">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const qty = Number(it.qty) || 0
              const price = Number(it.price) || 0
              return (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="px-1.5 py-2.5">
                    <div>{it.name}</div>
                    {it.sku && (
                      <div className="text-[10px] text-neutral-500">SKU {it.sku}</div>
                    )}
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums">{qty}</td>
                  <td className="px-1.5 py-2.5 text-right tabular-nums">
                    ${price.toLocaleString('es-AR')}
                  </td>
                  <td className="px-1.5 py-2.5 text-right font-semibold tabular-nums">
                    ${(qty * price).toLocaleString('es-AR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="px-1.5 py-2.5 text-right text-xs text-neutral-600">
                {order.payment_method || 'Pago no especificado'}
              </td>
              <td className="px-1.5 py-2.5 text-right text-base font-extrabold tabular-nums">
                ${Number(order.total || subtotal).toLocaleString('es-AR')}
              </td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <section className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Notas
            </div>
            <div className="whitespace-pre-wrap text-sm">{order.notes}</div>
          </section>
        )}

        <section className="mt-10 grid grid-cols-2 gap-10">
          <div className="border-t border-black pt-1.5 text-center text-[11px] text-neutral-600">
            Firma del repartidor
          </div>
          <div className="border-t border-black pt-1.5 text-center text-[11px] text-neutral-600">
            Firma / aclaración del cliente
          </div>
        </section>
      </main>
    </div>
  )
}
