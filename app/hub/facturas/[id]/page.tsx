import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaProveedor, FacturaItem, Pago, PagoFactura, FacturaEstado } from '@/lib/types/admin'
import HubSidebar from '../../_components/sidebar'
import EstadoActions from './estado-actions'
import { FACTURA_ESTADO_COLORS, vencimientoBadge } from '@/lib/admin-hub/factura'

export const dynamic = 'force-dynamic'

export default async function FacturaDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','tesoreria','auditor','sucursal'],
  })
  const sb = createClient()

  const [facRes, itemsRes, aplicRes] = await Promise.all([
    sb.from('facturas_proveedor')
      .select('*, proveedores(razon_social, cuit), sucursales(nombre)')
      .eq('id', params.id).maybeSingle(),
    sb.from('factura_items').select('*').eq('factura_id', params.id).order('created_at', { ascending: true }).returns<FacturaItem[]>(),
    sb.from('pago_facturas')
      .select('monto_aplicado, pagos(id, numero_orden_pago, fecha_pago, estado)')
      .eq('factura_id', params.id),
  ])

  const f = facRes.data as any
  if (!f) notFound()

  const items = itemsRes.data ?? []
  const aplicaciones = (aplicRes.data ?? []) as any[]
  const pagado = aplicaciones.reduce((a, x) => a + Number(x.monto_aplicado || 0), 0)
  const saldo = Number(f.total) - pagado

  const c = FACTURA_ESTADO_COLORS[f.estado as FacturaEstado]
  const venc = vencimientoBadge(f.fecha_vencimiento, f.estado)
  const canEditEstado = ['super_admin','gerente','administrativo','tesoreria'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/hub/facturas" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Facturas
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px', fontFamily: 'ui-monospace, monospace' }}>
              {f.tipo_factura} {String(f.punto_venta).padStart(5,'0')}-{String(f.numero_factura).padStart(8,'0')}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {f.proveedores?.razon_social} · CUIT {f.proveedores?.cuit}
              {f.sucursales?.nombre ? ` · ${f.sucursales.nombre}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '4px 10px', borderRadius: 999 }}>
            {FACTURA_ESTADO_LABELS[f.estado as FacturaEstado]}
          </span>
          {venc && (
            <span style={{ fontSize: 11, fontWeight: 700, color: venc.fg, background: venc.bg, border: `0.5px solid ${venc.border}`, padding: '4px 10px', borderRadius: 999 }}>
              {venc.text}
            </span>
          )}
        </header>

        <main style={{ padding: 20, maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi label="Total" value={`$${Number(f.total).toLocaleString('es-AR')}`} fg="#2a2a2a" bg="#fff" border="#ede9e4" />
            <Kpi label="Pagado" value={`$${pagado.toLocaleString('es-AR')}`} fg="#1f8a4c" bg="#eaf7ef" border="#8fd1a8" />
            <Kpi label="Saldo" value={`$${saldo.toLocaleString('es-AR')}`} fg={saldo > 0 ? '#a33' : '#888'} bg={saldo > 0 ? '#fbeaea' : '#f5f5f5'} border={saldo > 0 ? '#e0a8a8' : '#e2e2e2'} />
            <Kpi label="Emitida" value={new Date(f.fecha_emision).toLocaleDateString('es-AR')} fg="#2855c7" bg="#e9f0ff" border="#9cb6ee" />
            <Kpi label="Vence" value={new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')} fg="#c6831a" bg="#fff7ec" border="#edc989" />
          </section>

          {canEditEstado && (
            <EstadoActions facturaId={f.id} currentEstado={f.estado} />
          )}

          <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>ITEMS</div>
            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa' }}>Sin items cargados.</div>
            ) : (
              <div className="sa-list-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #ede9e4' }}>
                      {['Descripción','Cantidad','Precio unit.','IVA %','Subtotal'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                        <td style={{ padding: '8px 10px' }}>{it.descripcion}</td>
                        <td style={{ padding: '8px 10px' }}>{it.cantidad}</td>
                        <td style={{ padding: '8px 10px' }}>${Number(it.precio_unitario).toLocaleString('es-AR')}</td>
                        <td style={{ padding: '8px 10px' }}>{it.alicuota_iva}%</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>${Number(it.subtotal).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: 14, padding: 12, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 13 }}>
              <span style={{ color: '#666' }}>Subtotal</span><span style={{ textAlign: 'right' }}>${Number(f.subtotal).toLocaleString('es-AR')}</span>
              {Number(f.iva_21)  > 0 && (<><span style={{ color: '#666' }}>IVA 21%</span><span style={{ textAlign: 'right' }}>${Number(f.iva_21).toLocaleString('es-AR')}</span></>)}
              {Number(f.iva_105) > 0 && (<><span style={{ color: '#666' }}>IVA 10,5%</span><span style={{ textAlign: 'right' }}>${Number(f.iva_105).toLocaleString('es-AR')}</span></>)}
              {Number(f.iva_27)  > 0 && (<><span style={{ color: '#666' }}>IVA 27%</span><span style={{ textAlign: 'right' }}>${Number(f.iva_27).toLocaleString('es-AR')}</span></>)}
              {Number(f.percepciones) > 0 && (<><span style={{ color: '#666' }}>Percepciones</span><span style={{ textAlign: 'right' }}>+${Number(f.percepciones).toLocaleString('es-AR')}</span></>)}
              {Number(f.retenciones)  > 0 && (<><span style={{ color: '#666' }}>Retenciones</span><span style={{ textAlign: 'right', color: '#a33' }}>-${Number(f.retenciones).toLocaleString('es-AR')}</span></>)}
              <span style={{ fontWeight: 800, marginTop: 4, paddingTop: 6, borderTop: '0.5px solid #ede9e4' }}>TOTAL</span>
              <span style={{ fontWeight: 800, marginTop: 4, paddingTop: 6, borderTop: '0.5px solid #ede9e4', textAlign: 'right' }}>${Number(f.total).toLocaleString('es-AR')}</span>
            </div>
          </section>

          {aplicaciones.length > 0 && (
            <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>PAGOS APLICADOS</div>
              {aplicaciones.map((a: any) => (
                <div key={a.pagos?.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '0.5px solid #f5f1ec' }}>
                  <div>
                    <Link href={`/hub/pagos/${a.pagos?.id}`} style={{ color: '#726DFF', textDecoration: 'none', fontWeight: 600 }}>
                      {a.pagos?.numero_orden_pago}
                    </Link>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                      · {new Date(a.pagos?.fecha_pago).toLocaleDateString('es-AR')} · {a.pagos?.estado}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700 }}>${Number(a.monto_aplicado).toLocaleString('es-AR')}</div>
                </div>
              ))}
            </section>
          )}

          {f.observaciones && (
            <section style={{ background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', letterSpacing: '0.4px', marginBottom: 6 }}>OBSERVACIONES</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{f.observaciones}</div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function Kpi({ label, value, fg, bg, border }: { label: string; value: string; fg: string; bg: string; border: string }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: fg, letterSpacing: '0.3px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: fg, letterSpacing: '-0.3px', marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
