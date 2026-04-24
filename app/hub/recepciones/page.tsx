import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { RECEPCION_ESTADO_LABELS } from '@/lib/types/admin'
import type { RecepcionEstado } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<RecepcionEstado, { fg: string; bg: string; border: string }> = {
  completa:        { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  parcial:         { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  con_diferencias: { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  rechazada:       { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default async function RecepcionesPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','sucursal','auditor'],
  })
  const sb = createClient()

  const { data: rows, error } = await sb
    .from('recepciones_mercaderia')
    .select('*, sucursales(nombre), recepcion_items(count)')
    .order('fecha_recepcion', { ascending: false })
    .limit(500)

  const canCreate = ['super_admin','gerente','administrativo','sucursal'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Recepciones de mercadería</div>
            <div style={{ fontSize: 12, color: '#888' }}>{(rows ?? []).length} recepción{(rows ?? []).length === 1 ? '' : 'es'}</div>
          </div>
          {canCreate && (
            <Link href="/hub/recepciones/nueva"
              style={{ padding: '10px 14px', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Nueva recepción
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
                  {['Remito','Fecha','Sucursal','Items','Estado',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>Sin recepciones cargadas.</td></tr>
                )}
                {(rows ?? []).map((r: any) => {
                  const c = ESTADO_COLOR[r.estado as RecepcionEstado]
                  const itemsCount = Array.isArray(r.recepcion_items) ? (r.recepcion_items[0]?.count ?? 0) : 0
                  return (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700 }}>
                        {r.numero_remito || '— sin remito —'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>
                        {new Date(r.fecha_recepcion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{r.sucursales?.nombre || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{itemsCount}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '3px 8px', borderRadius: 999 }}>
                          {RECEPCION_ESTADO_LABELS[r.estado as RecepcionEstado]}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link href={`/hub/recepciones/${r.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
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
