import Link from 'next/link'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/types/admin'
import HubSidebar from './_components/sidebar'

export const dynamic = 'force-dynamic'

type SectionCard = {
  href: string
  title: string
  desc: string
  icon: string
  roles?: AdminRole[]
  comingSoon?: boolean
}

const SECTIONS: SectionCard[] = [
  { href: '/hub/proveedores',  title: 'Proveedores',   desc: 'Maestro de proveedores, contactos, cuentas bancarias y documentos.', icon: '🏭' },
  { href: '/hub/facturas',     title: 'Facturas',      desc: 'Facturas de proveedor, estado, vencimientos.',                       icon: '📄', comingSoon: true },
  { href: '/hub/pagos',        title: 'Pagos',         desc: 'Órdenes de pago y conciliación.',                                    icon: '💸', roles: ['super_admin','gerente','tesoreria','auditor'], comingSoon: true },
  { href: '/hub/recepciones',  title: 'Recepciones',   desc: 'Recepción de mercadería en sucursal.',                               icon: '📦', comingSoon: true },
  { href: '/hub/sucursales',   title: 'Sucursales',    desc: 'Alta y edición de sucursales.',                                      icon: '🏪', roles: ['super_admin','gerente'], comingSoon: true },
  { href: '/hub/usuarios',     title: 'Usuarios',      desc: 'Admins del Hub y sus roles.',                                        icon: '👥', roles: ['super_admin','gerente'], comingSoon: true },
  { href: '/dashboard',        title: 'CRM Pedidos',   desc: 'Panel operativo de pedidos de la farmacia (app existente).',         icon: '🛵' },
]

export default async function HubHome() {
  const profile = await requireAdminHubAccess()

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px' }}>
            Hola, {profile.nombre?.split(' ')[0] || profile.email} 👋
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {ADMIN_ROLE_LABELS[profile.rol]} · Admin Hub de Social Ahorro Farmacias
          </div>
        </header>

        <main style={{ padding: '24px 24px', maxWidth: 1100 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {SECTIONS.map(s => {
              const allowed = !s.roles || s.roles.includes(profile.rol)
              if (!allowed) return null
              const disabled = s.comingSoon
              const card = (
                <div style={{
                  background: '#fff',
                  border: `0.5px solid ${disabled ? '#ede9e4' : '#d9d6ff'}`,
                  borderRadius: 16, padding: 18,
                  display: 'flex', flexDirection: 'column', gap: 8,
                  minHeight: 140,
                  opacity: disabled ? 0.65 : 1,
                  position: 'relative',
                }}>
                  <div style={{ fontSize: 28 }}>{s.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px' }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{s.desc}</div>
                  {disabled && (
                    <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '2px 8px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      Próximamente
                    </span>
                  )}
                </div>
              )
              return disabled
                ? <div key={s.href}>{card}</div>
                : <Link key={s.href} href={s.href} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
            })}
          </section>
        </main>
      </div>
    </div>
  )
}
