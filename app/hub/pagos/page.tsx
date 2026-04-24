import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PAGO_ESTADO_LABELS, METODO_PAGO_LABELS } from '@/lib/types/admin'
import type { PagoEstado } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<PagoEstado, { fg: string; bg: string; border: string }> = {
  solicitado: { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  aprobado:   { fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
  ejecutado:  { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  conciliado: { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  anulado:    { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default async function PagosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','tesoreria','auditor'],
  })
  const sb = createClient()

  const { data: rows, error } = await sb
    .from('pagos')
    .select('*, proveedores(razon_social), pago_facturas(count)')
    .order('fecha_pago', { ascending: false })
    .limit(500)

  const canCreate = ['super_admin','gerente','tesoreria'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Pagos a proveedores</div>
            <div style={{ fontSize: 12, color: '#888' }}>{(rows ?? []).length} órden{(rows ?? []).length === 1 ? '' : 'es'} de pago</div>
          </div>
          {canCreate && (
            <Link href="/hub/pagos/nuevo"
              style={{ padding: '10px 14px', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Nueva OP
            </Link>
          )}
        </header>

        {error && (
          <div style={{ margin: 20, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
            {error.message}
          </div>
        )}

        <main style={{ padding: 20 }}>
          <div className="sa-list-table-wrap" style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#faf8f5', borderBottom: '0.5px solid #ede9e4' }}>
                  {['OP','Proveedor','Fecha','Método','Monto','Facturas','Estado',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>Sin pagos cargados.</td></tr>
                )}
                {(rows ?? []).map((r: any) => {
                  const c = ESTADO_COLOR[r.estado as PagoEstado]
                  const apliCount = Array.isArray(r.pago_facturas) ? (r.pago_facturas[0]?.count ?? 0) : 0
                  return (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700 }}>{r.numero_orden_pago}</td>
                      <td style={{ padding: '10px 12px' }}>{r.proveedores?.razon_social || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{new Date(r.fecha_pago).toLocaleDateString('es-AR')}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{METODO_PAGO_LABELS[r.metodo_pago as keyof typeof METODO_PAGO_LABELS]}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>${Number(r.monto_total).toLocaleString('es-AR')}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{apliCount}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '3px 8px', borderRadius: 999 }}>
                          {PAGO_ESTADO_LABELS[r.estado as PagoEstado]}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link href={`/hub/pagos/${r.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
