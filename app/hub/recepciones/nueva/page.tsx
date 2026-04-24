import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import HubSidebar from '../../_components/sidebar'
import NuevaRecepcionForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaRecepcionPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','sucursal'],
  })
  const sb = createClient()

  const { data: sucursales } = await sb
    .from('sucursales')
    .select('id, nombre')
    .eq('activa', true)
    .order('nombre', { ascending: true })

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/hub/recepciones" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Volver
          </Link>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>Nueva recepción</div>
            <div style={{ fontSize: 12, color: '#888' }}>Cargá los items y las cantidades. El estado se calcula automáticamente.</div>
          </div>
        </header>

        <main style={{ padding: 24, maxWidth: 980 }}>
          <NuevaRecepcionForm
            sucursales={(sucursales ?? []) as Array<{ id: string; nombre: string }>}
            forcedSucursalId={profile.rol === 'sucursal' ? profile.sucursal_id : null}
          />
        </main>
      </div>
    </div>
  )
}
