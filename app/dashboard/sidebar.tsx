import Link from 'next/link'
import type { UserPedidos } from '@/lib/types'

const NAV_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
  borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none',
  color: '#d9d6d1',
}

export default function DashboardSidebar({ profile }: { profile: UserPedidos }) {
  const roleLabel =
    profile.role === 'admin'    ? 'Administrador' :
    profile.role === 'operador' ? 'Operador'      : 'Repartidor'

  return (
    <aside style={{
      width: 220, background: '#2a2a2a', color: '#fff',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      borderRight: '0.5px solid #1a1a1a',
    }}>
      <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.2px', color: '#fff' }}>Social Ahorro</div>
          <div style={{ fontSize: 11, color: '#999' }}>Gestión de pedidos</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', flex: 1 }}>
        <Link href="/dashboard"
          style={{ ...NAV_ITEM, background: '#3a3a3a', color: '#fff' }}>
          <span>📋</span> Pedidos
        </Link>
        <Link href="/pedidos/nuevo" style={NAV_ITEM}>
          <span>➕</span> Nuevo pedido
        </Link>
        {profile.role === 'admin' && (
          <Link href="/admin/configuracion" style={NAV_ITEM}>
            <span>⚙</span> Configuración
          </Link>
        )}
      </nav>

      <div style={{ borderTop: '0.5px solid #1a1a1a', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{profile.name || profile.email}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{roleLabel}</div>
        </div>
        <Link href="/logout"
          style={{ ...NAV_ITEM, justifyContent: 'center', background: 'transparent', border: '1px solid #3a3a3a', padding: '8px 10px' }}>
          Salir
        </Link>
      </div>
    </aside>
  )
}
