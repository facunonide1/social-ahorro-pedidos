import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'

type SectionCard = {
  href: string
  title: string
  desc: string
  icon: string
  // Roles con acceso. Si está vacío, acceso universal.
  roles?: AdminRole[]
  comingSoon?: boolean
}

const SECTIONS: SectionCard[] = [
  { href: '/hub/proveedores',  title: 'Proveedores',   desc: 'Maestro de proveedores, contactos, cuentas bancarias y documentos.', icon: '🏭', comingSoon: true },
  { href: '/hub/facturas',     title: 'Facturas',      desc: 'Facturas de proveedor, estado, vencimientos.',                       icon: '📄', comingSoon: true },
  { href: '/hub/pagos',        title: 'Pagos',         desc: 'Órdenes de pago y conciliación.',                                    icon: '💸', roles: ['super_admin','gerente','tesoreria','auditor'], comingSoon: true },
  { href: '/hub/recepciones',  title: 'Recepciones',   desc: 'Recepción de mercadería en sucursal.',                               icon: '📦', comingSoon: true },
  { href: '/hub/sucursales',   title: 'Sucursales',    desc: 'Alta y edición de sucursales.',                                      icon: '🏪', roles: ['super_admin','gerente'], comingSoon: true },
  { href: '/hub/usuarios',     title: 'Usuarios',      desc: 'Admins del Hub y sus roles.',                                        icon: '👥', roles: ['super_admin','gerente'], comingSoon: true },
  { href: '/dashboard',        title: 'CRM Pedidos',   desc: 'Panel operativo de pedidos de la farmacia (app existente).',         icon: '🛵' },
]

export default async function HubHome() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_admin')
    .select('rol, activo, sucursal_id')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()

  if (!profile?.activo) redirect('/logout?reason=sin_permiso')

  // Datos del user desde auth (para nombre)
  const nombre = (user.user_metadata as any)?.nombre || user.email

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#2a2a2a', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: '#FF6D6E' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Social Ahorro · Admin Hub</div>
            <div style={{ fontSize: 12, color: '#bbb' }}>
              {nombre} · {ADMIN_ROLE_LABELS[profile.rol]}
            </div>
          </div>
        </div>
        <form action="/logout" method="post">
          <button type="submit" style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'transparent', border: '1px solid #4a4a4a', borderRadius: 10, cursor: 'pointer' }}>
            Salir
          </button>
        </form>
      </header>

      <main style={{ padding: '24px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 }}>
            Bienvenido, {nombre.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>
            Este es el hub central de Social Ahorro Farmacias. Desde acá vas a operar proveedores, facturas, pagos y recepción, además del CRM de pedidos ya existente.
          </div>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {SECTIONS.map(s => {
            const allowed = !s.roles || s.roles.includes(profile.rol)
            if (!allowed) return null
            const disabled = s.comingSoon
            const card = (
              <div style={{
                background: disabled ? '#fff' : '#fff',
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

        <section style={{ marginTop: 30, background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            ESTADO DE LA IMPLEMENTACIÓN
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#555', lineHeight: 1.7 }}>
            <li>Schema del Admin Hub aplicado (14 tablas, 12 enums, RLS por rol).</li>
            <li>Fix del trigger de cuponera para permitir creación de admins sin romper signups existentes.</li>
            <li>Endpoint y form <code>/bootstrap</code> para crear el primer super_admin.</li>
            <li>Las pantallas de proveedores / facturas / pagos / recepciones se arman en la próxima iteración.</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
