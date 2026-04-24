import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PAGO_ESTADO_LABELS, METODO_PAGO_LABELS, FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { PagoEstado, FacturaEstado } from '@/lib/types/admin'
import HubSidebar from '../../_components/sidebar'
import PagoEstadoActions from './estado-actions'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<PagoEstado, { fg: string; bg: string; border: string }> = {
  solicitado: { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  aprobado:   { fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
  ejecutado:  { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  conciliado: { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  anulado:    { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default async function PagoDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','tesoreria','auditor'],
  })
  const sb = createClient()

  const [pagoRes, aplicRes] = await Promise.all([
    sb.from('pagos')
      .select('*, proveedores(razon_social, cuit)')
      .eq('id', params.id).maybeSingle(),
    sb.from('pago_facturas')
      .select('monto_aplicado, facturas_proveedor(id, tipo_factura, punto_venta, numero_factura, fecha_emision, fecha_vencimiento, total, estado)')
      .eq('pago_id', params.id),
  ])

  const p = pagoRes.data as any
  if (!p) notFound()

  const aplicaciones = (aplicRes.data ?? []) as any[]
  const c = ESTADO_COLOR[p.estado as PagoEstado]
  const canEdit = ['super_admin','gerente','tesoreria'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/hub/pagos" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Pagos
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px', fontFamily: 'ui-monospace, monospace' }}>
              {p.numero_orden_pago ?? '— sin OP —'}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {p.proveedores?.razon_social} · CUIT {p.proveedores?.cuit}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '4px 10px', borderRadius: 999 }}>
            {PAGO_ESTADO_LABELS[p.estado as PagoEstado]}
          </span>
        </header>

        <main style={{ padding: 20, maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi label="Monto total" value={`$${Number(p.monto_total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`} fg="#2a2a2a" bg="#fff" border="#ede9e4" />
            <Kpi label="Retenciones" value={`$${Number(p.retenciones_aplicadas).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`} fg="#a33" bg="#fbeaea" border="#e0a8a8" />
            <Kpi label="Monto neto" value={`$${Number(p.monto_neto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`} fg="#1f8a4c" bg="#eaf7ef" border="#8fd1a8" />
            <Kpi label="Fecha" value={new Date(p.fecha_pago).toLocaleDateString('es-AR')} fg="#2855c7" bg="#e9f0ff" border="#9cb6ee" />
            <Kpi label="Método" value={METODO_PAGO_LABELS[p.metodo_pago as keyof typeof METODO_PAGO_LABELS]} fg="#c6831a" bg="#fff7ec" border="#edc989" />
          </section>

          {canEdit && (
            <PagoEstadoActions pagoId={p.id} currentEstado={p.estado} />
          )}

          <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS DE LA OP</div>
            <Row k="Cuenta / Referencia" v={p.cuenta_bancaria_origen || '—'} />
            <Row k="Moneda" v={p.moneda || 'ARS'} />
            <Row k="Comprobante" v={p.comprobante_url
              ? <a href={p.comprobante_url} target="_blank" rel="noreferrer" style={{ color: '#726DFF' }}>Ver comprobante</a>
              : '—'} />
          </section>

          <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>FACTURAS APLICADAS</div>
            {aplicaciones.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa' }}>Sin facturas aplicadas (pago sin asignar a comprobantes específicos).</div>
            ) : (
              <div className="sa-list-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #ede9e4' }}>
                      {['Comprobante','Vence','Total factura','Aplicado','Estado',''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aplicaciones.map((a, i) => {
                      const f = a.facturas_proveedor
                      if (!f) return null
                      return (
                        <tr key={i} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                            {f.tipo_factura} {f.punto_venta}-{f.numero_factura}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#666' }}>{new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')}</td>
                          <td style={{ padding: '8px 10px' }}>${Number(f.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>${Number(a.monto_aplicado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 10px', color: '#666' }}>{FACTURA_ESTADO_LABELS[f.estado as FacturaEstado]}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <Link href={`/hub/facturas/${f.id}`} style={{ color: '#726DFF', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}>
                              Ver →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {p.observaciones && (
            <section style={{ background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', letterSpacing: '0.4px', marginBottom: 6 }}>OBSERVACIONES</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{p.observaciones}</div>
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

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, fontSize: 13, paddingBottom: 4, borderBottom: '0.5px solid #f5f1ec' }}>
      <span style={{ color: '#888' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}
