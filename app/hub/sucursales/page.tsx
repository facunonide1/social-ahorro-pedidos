import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'

export const dynamic = 'force-dynamic'

export default async function SucursalesPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin','gerente'] })
  const sb = createClient()

  const { data: sucursales, error } = await sb
    .from('sucursales')
    .select('*')
    .order('activa', { ascending: false })
    .order('nombre', { ascending: true })
    .returns<Sucursal[]>()

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Sucursales</div>
            <div style={{ fontSize: 12, color: '#888' }}>{(sucursales ?? []).length} sucursal{(sucursales ?? []).length === 1 ? '' : 'es'}</div>
          </div>
          <Link href="/hub/sucursales/nueva"
            style={{ padding: '10px 14px', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            + Nueva sucursal
          </Link>
        </header>

        {error && (
          <div style={{ margin: 20, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
            {error.message}
          </div>
        )}

        <main style={{ padding: 20, maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(sucursales ?? []).length === 0 && !error && (
            <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 28, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
              Todavía no hay sucursales cargadas.
            </div>
          )}

          {(sucursales ?? []).map(s => (
            <Link key={s.id} href={`/hub/sucursales/${s.id}`}
              style={{ textDecoration: 'none', color: 'inherit',
                background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 14,
                padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                opacity: s.activa ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {s.nombre}
                  {s.codigo && <span style={{ fontSize: 11, color: '#888', fontWeight: 500, marginLeft: 8 }}>· {s.codigo}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {[s.direccion, s.localidad, s.provincia].filter(Boolean).join(', ') || 'sin dirección cargada'}
                </div>
                {(s.telefono || s.email) && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {[s.telefono, s.email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div>
                {s.activa ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '2px 8px', borderRadius: 999 }}>
                    Activa
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#888', background: '#f5f5f5', border: '0.5px solid #e2e2e2', padding: '2px 8px', borderRadius: 999 }}>
                    Inactiva
                  </span>
                )}
              </div>
            </Link>
          ))}
        </main>
      </div>
    </div>
  )
}
