import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import HubSidebar from '../../_components/sidebar'
import NuevoPagoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoPagoPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','tesoreria'],
  })
  const sb = createClient()

  const { data: proveedores } = await sb
    .from('proveedores')
    .select('id, razon_social, cuit')
    .eq('activo', true)
    .order('razon_social', { ascending: true })

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/hub/pagos" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Volver
          </Link>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>Nueva orden de pago</div>
            <div style={{ fontSize: 12, color: '#888' }}>Elegí un proveedor, seleccioná las facturas a cancelar e informá el método.</div>
          </div>
        </header>

        <main style={{ padding: 24, maxWidth: 980 }}>
          <NuevoPagoForm proveedores={(proveedores ?? []) as Array<{ id: string; razon_social: string; cuit: string }>} />
        </main>
      </div>
    </div>
  )
}
