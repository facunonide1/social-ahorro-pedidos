import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { Proveedor } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'
import Filters from './filters'

export const dynamic = 'force-dynamic'

type ProveedorConStats = Proveedor & {
  facturas_count?: number
}

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: { q?: string; categoria?: string; activo?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','comprador','administrativo','auditor'],
  })
  const sb = createClient()

  const q = (searchParams.q || '').trim()
  const categoria = (searchParams.categoria || '').trim()
  const activoRaw = searchParams.activo
  const activoFilter: boolean | null =
    activoRaw === '1' ? true : activoRaw === '0' ? false : null

  let query = sb
    .from('proveedores')
    .select('*, facturas_count:facturas_proveedor(count)')
    .order('razon_social', { ascending: true })
    .limit(500)

  if (q) {
    const like = `%${q}%`
    query = query.or(
      `razon_social.ilike.${like},nombre_comercial.ilike.${like},cuit.ilike.${like}`
    )
  }
  if (categoria) query = query.eq('categoria', categoria)
  if (activoFilter !== null) query = query.eq('activo', activoFilter)

  const { data: rawRows, error } = await query
  const rows: ProveedorConStats[] = (rawRows ?? []).map((r: any) => ({
    ...r,
    facturas_count: Array.isArray(r.facturas_count) ? (r.facturas_count[0]?.count ?? 0) : 0,
  }))

  // Lista de categorías únicas para el filtro
  const { data: catRows } = await sb
    .from('proveedores').select('categoria').not('categoria', 'is', null)
  const categorias = Array.from(
    new Set((catRows ?? []).map((r: any) => r.categoria).filter(Boolean))
  ).sort()

  const canCreate = ['super_admin','gerente','comprador','administrativo'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Proveedores</div>
            <div style={{ fontSize: 12, color: '#888' }}>{rows.length} resultado{rows.length === 1 ? '' : 's'}{q ? ` para "${q}"` : ''}</div>
          </div>
          {canCreate && (
            <Link href="/hub/proveedores/nuevo"
              style={{ padding: '10px 14px', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Nuevo proveedor
            </Link>
          )}
        </header>

        {error && (
          <div style={{ margin: 20, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
            {error.message}
          </div>
        )}

        <section style={{ padding: '16px 24px 0' }}>
          <Filters
            initialQ={q}
            initialCategoria={categoria}
            initialActivo={activoRaw ?? ''}
            categorias={categorias}
          />
        </section>

        <main style={{ padding: '16px 24px 24px' }}>
          <div className="sa-list-table-wrap" style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#faf8f5', borderBottom: '0.5px solid #ede9e4' }}>
                  {['Razón social','CUIT','Categoría','Condición IVA','Plazo pago','Facturas','Estado',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>
                    {q || categoria || activoFilter !== null
                      ? 'Sin coincidencias.'
                      : 'Todavía no hay proveedores cargados.'}
                  </td></tr>
                )}
                {rows.map(p => (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid #f5f1ec', opacity: p.activo ? 1 : 0.55 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      {p.razon_social}
                      {p.nombre_comercial && (
                        <div style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>{p.nombre_comercial}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#666', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{p.cuit}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{p.categoria || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>
                      {p.condicion_iva ? CONDICION_IVA_LABELS[p.condicion_iva] : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{p.plazo_pago_dias}d</td>
                    <td style={{ padding: '10px 12px', color: '#2a2a2a', fontWeight: 600 }}>{p.facturas_count ?? 0}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {p.activo ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '2px 8px', borderRadius: 999 }}>
                          Activo
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', background: '#f5f5f5', border: '0.5px solid #e2e2e2', padding: '2px 8px', borderRadius: 999 }}>
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link href={`/hub/proveedores/${p.id}`}
                        style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
