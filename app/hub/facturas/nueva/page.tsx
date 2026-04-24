import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import HubSidebar from '../../_components/sidebar'
import NuevaFacturaForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaFacturaPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','tesoreria'],
  })
  const sb = createClient()

  const [provRes, sucRes] = await Promise.all([
    sb.from('proveedores').select('id, razon_social, plazo_pago_dias').eq('activo', true).order('razon_social'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/hub/facturas" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Volver
          </Link>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>Nueva factura</div>
        </header>

        <main style={{ padding: 24, maxWidth: 880 }}>
          <NuevaFacturaForm
            proveedores={(provRes.data ?? []) as any[]}
            sucursales={(sucRes.data ?? []) as any[]}
          />
        </main>
      </div>
    </div>
  )
}
