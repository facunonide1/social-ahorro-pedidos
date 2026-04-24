import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal } from '@/lib/types/admin'
import HubSidebar from '../../_components/sidebar'
import SucursalForm from '../sucursal-form'

export const dynamic = 'force-dynamic'

export default async function SucursalDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin','gerente'] })
  const sb = createClient()

  const { data: s } = await sb.from('sucursales').select('*').eq('id', params.id).maybeSingle<Sucursal>()
  if (!s) notFound()

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/hub/sucursales" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Sucursales
          </Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{s.nombre}</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {s.codigo ? `Código ${s.codigo}` : 'Sin código interno'}
              {!s.activa ? ' · INACTIVA' : ''}
            </div>
          </div>
        </header>

        <main style={{ padding: 24, maxWidth: 720 }}>
          <SucursalForm mode="edit" initial={s} />
        </main>
      </div>
    </div>
  )
}
