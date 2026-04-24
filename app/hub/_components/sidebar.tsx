import Link from 'next/link'
import type { HubProfile } from '@/lib/admin-hub/auth'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/types/admin'

type NavItem = {
  href: string
  label: string
  icon: string
  roles?: AdminRole[]
  comingSoon?: boolean
}

const NAV: NavItem[] = [
  { href: '/hub',              label: 'Inicio',       icon: '🏠' },
  { href: '/hub/proveedores',  label: 'Proveedores',  icon: '🏭', roles: ['super_admin','gerente','comprador','administrativo','auditor'] },
  { href: '/hub/facturas',     label: 'Facturas',     icon: '📄', roles: ['super_admin','gerente','administrativo','tesoreria','auditor'], comingSoon: true },
  { href: '/hub/pagos',        label: 'Pagos',        icon: '💸', roles: ['super_admin','gerente','tesoreria','auditor'], comingSoon: true },
  { href: '/hub/recepciones',  label: 'Recepciones',  icon: '📦', comingSoon: true },
  { href: '/hub/sucursales',   label: 'Sucursales',   icon: '🏪', roles: ['super_admin','gerente'], comingSoon: true },
  { href: '/hub/usuarios',     label: 'Usuarios',     icon: '👥', roles: ['super_admin','gerente'], comingSoon: true },
]

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
  borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none',
  color: '#d9d6d1',
}

export default function HubSidebar({ profile }: { profile: HubProfile }) {
  return (
    <aside className="sa-sidebar-desktop" style={{
      width: 220, background: '#2a2a2a', color: '#fff',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      borderRight: '0.5px solid #1a1a1a',
    }}>
      <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.2px', color: '#fff' }}>Social Ahorro</div>
          <div style={{ fontSize: 11, color: '#999' }}>Admin Hub</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', flex: 1, overflowY: 'auto' }}>
        {NAV.map(item => {
          const allowed = !item.roles || item.roles.includes(profile.rol)
          if (!allowed) return null
          if (item.comingSoon) {
            return (
              <div key={item.href} style={{ ...ITEM, opacity: 0.45, cursor: 'not-allowed' }}
                title="Próximamente">
                <span>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 9, color: '#777', background: '#3a3a3a', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.3px' }}>
                  PRONTO
                </span>
              </div>
            )
          }
          return (
            <Link key={item.href} href={item.href} style={ITEM}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div style={{ borderTop: '0.5px solid #1a1a1a', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{profile.nombre || profile.email}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{ADMIN_ROLE_LABELS[profile.rol]}</div>
        </div>
        <form action="/logout" method="post">
          <button type="submit" style={{
            width: '100%', padding: '8px 10px', borderRadius: 10, fontSize: 12,
            fontWeight: 600, color: '#d9d6d1', background: 'transparent',
            border: '1px solid #3a3a3a', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Salir
          </button>
        </form>
      </div>
    </aside>
  )
}
