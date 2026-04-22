import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, TIPO_ENVIO_LABELS } from '@/lib/types'
import type { Order, UserPedidos } from '@/lib/types'
import { formatAddress } from '@/lib/address'
import PrintButton from './print-button'

export const dynamic = 'force-dynamic'

export default async function RemitoPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos').select('id, role, active').eq('id', user.id).maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')

  const { data: order } = await sb.from('orders').select('*').eq('id', params.id).maybeSingle<Order>()
  if (!order) notFound()

  const addr = formatAddress(order.shipping_address) || formatAddress(order.billing_address)
  const subtotal = order.items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      {/* Barra superior (sólo en pantalla) */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <a href={`/pedidos/${order.id}`} style={{ color: '#726DFF', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          ← Volver al pedido
        </a>
        <PrintButton />
      </div>

      {/* Hoja del remito */}
      <main className="sa-remito-sheet" style={{
        background: '#fff', maxWidth: 720, margin: '20px auto', padding: '32px 40px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', color: '#2a2a2a',
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #2a2a2a', paddingBottom: 14, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: '#FF6D6E' }} />
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}>Social Ahorro</div>
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>socialahorro.com · Farmacia</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Remito</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{order.codigo}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {new Date(order.woo_created_at || order.created_at).toLocaleString('es-AR')}
            </div>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 4 }}>CLIENTE</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{order.customer_name || '—'}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              {order.customer_phone || ''}
              {order.customer_phone && order.customer_email ? ' · ' : ''}
              {order.customer_email || ''}
            </div>
            {order.customer_dni && <div style={{ fontSize: 12, color: '#555' }}>DNI {order.customer_dni}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 4 }}>ENTREGA</div>
            <div style={{ fontSize: 13 }}>
              <b>{TIPO_ENVIO_LABELS[order.tipo_envio]}</b> · {STATUS_LABELS[order.status]}
            </div>
            {addr && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{addr}</div>}
          </div>
        </section>

        <section>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #2a2a2a' }}>
                <th style={{ textAlign: 'left',  padding: '8px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#666' }}>Producto</th>
                <th style={{ textAlign: 'center',padding: '8px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#666' }}>Cant.</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#666' }}>P. unit.</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#666' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => {
                const qty = Number(it.qty) || 0
                const price = Number(it.price) || 0
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid #e8e8e8' }}>
                    <td style={{ padding: '10px 6px' }}>
                      <div>{it.name}</div>
                      {it.sku && <div style={{ fontSize: 10, color: '#999' }}>SKU {it.sku}</div>}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'center' }}>{qty}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>${price.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>${(qty * price).toLocaleString('es-AR')}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ padding: '10px 6px', textAlign: 'right', fontSize: 12, color: '#666' }}>
                  {order.payment_method || 'Pago no especificado'}
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: 16, fontWeight: 800 }}>
                  ${Number(order.total || subtotal).toLocaleString('es-AR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {order.notes && (
          <section style={{ marginBottom: 20, padding: 12, background: '#faf8f5', border: '0.5px solid #ede9e4', borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 4 }}>NOTAS</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{order.notes}</div>
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40 }}>
          <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 6, fontSize: 11, color: '#666', textAlign: 'center' }}>
            Firma del repartidor
          </div>
          <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 6, fontSize: 11, color: '#666', textAlign: 'center' }}>
            Firma / aclaración del cliente
          </div>
        </section>
      </main>

      {/* Estilos específicos de impresión */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sa-remito-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            padding: 16mm !important;
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  )
}
