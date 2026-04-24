import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { RECEPCION_ESTADO_LABELS } from '@/lib/types/admin'
import type { RecepcionEstado } from '@/lib/types/admin'
import HubSidebar from '../../_components/sidebar'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<RecepcionEstado, { fg: string; bg: string; border: string }> = {
  completa:        { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  parcial:         { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  con_diferencias: { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  rechazada:       { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default async function RecepcionDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','sucursal','auditor'],
  })
  const sb = createClient()

  const [recRes, itemsRes] = await Promise.all([
    sb.from('recepciones_mercaderia')
      .select('*, sucursales(nombre)')
      .eq('id', params.id).maybeSingle(),
    sb.from('recepcion_items')
      .select('*').eq('recepcion_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  const r = recRes.data as any
  if (!r) notFound()
  const items = (itemsRes.data ?? []) as any[]
  const c = ESTADO_COLOR[r.estado as RecepcionEstado]

  const totales = items.reduce((acc, it) => {
    acc.pedido   += Number(it.cantidad_pedida   ?? 0)
    acc.recibido += Number(it.cantidad_recibida ?? 0)
    acc.danado   += Number(it.cantidad_danada   ?? 0)
    return acc
  }, { pedido: 0, recibido: 0, danado: 0 })

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/hub/recepciones" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Recepciones
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>
              {r.numero_remito || 'Recepción sin remito'}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {new Date(r.fecha_recepcion).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}
              {r.sucursales?.nombre ? ` · ${r.sucursales.nombre}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '4px 10px', borderRadius: 999 }}>
            {RECEPCION_ESTADO_LABELS[r.estado as RecepcionEstado]}
          </span>
        </header>

        <main style={{ padding: 20, maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi label="Items" value={String(items.length)} fg="#2a2a2a" bg="#fff" border="#ede9e4" />
            <Kpi label="Total pedido" value={totales.pedido.toLocaleString('es-AR')} fg="#2855c7" bg="#e9f0ff" border="#9cb6ee" />
            <Kpi label="Total recibido" value={totales.recibido.toLocaleString('es-AR')} fg="#1f8a4c" bg="#eaf7ef" border="#8fd1a8" />
            <Kpi label="Dañados" value={totales.danado.toLocaleString('es-AR')} fg="#a33" bg="#fbeaea" border="#e0a8a8" />
          </section>

          <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>ITEMS</div>
            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa' }}>No se cargaron items.</div>
            ) : (
              <div className="sa-list-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #ede9e4' }}>
                      {['Descripción','Pedido','Recibido','Dañados','Vence','Diferencia'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => {
                      const ped = Number(it.cantidad_pedida ?? 0)
                      const rec = Number(it.cantidad_recibida ?? 0)
                      const dan = Number(it.cantidad_danada ?? 0)
                      const dif = rec - ped
                      return (
                        <tr key={it.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                          <td style={{ padding: '8px 10px' }}>
                            {it.descripcion || '—'}
                            {it.observaciones && (
                              <div style={{ fontSize: 11, color: '#888' }}>{it.observaciones}</div>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#666' }}>{it.cantidad_pedida ?? '—'}</td>
                          <td style={{ padding: '8px 10px' }}>{it.cantidad_recibida ?? '—'}</td>
                          <td style={{ padding: '8px 10px', color: dan > 0 ? '#a33' : '#666', fontWeight: dan > 0 ? 700 : 400 }}>{dan}</td>
                          <td style={{ padding: '8px 10px', color: '#666' }}>
                            {it.fecha_vencimiento_producto ? new Date(it.fecha_vencimiento_producto).toLocaleDateString('es-AR') : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: dif === 0 ? '#1f8a4c' : '#a33', fontWeight: 700 }}>
                            {ped === 0 ? '—' : (dif === 0 ? '✓' : (dif > 0 ? `+${dif}` : `${dif}`))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {r.observaciones && (
            <section style={{ background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', letterSpacing: '0.4px', marginBottom: 6 }}>OBSERVACIONES</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.observaciones}</div>
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
