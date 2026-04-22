'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UserPedidos } from '@/lib/types'

const NAV_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
  borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none',
  color: '#d9d6d1',
}

export default function MobileNav({ profile }: { profile: UserPedidos }) {
  const [open, setOpen] = useState(false)
  const roleLabel =
    profile.role === 'admin'    ? 'Administrador' :
    profile.role === 'operador' ? 'Operador'      : 'Repartidor'

  return (
    <>
      {/* Topbar mobile: se muestra solo en mobile por la clase */}
      <div className="sa-mobile-topbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#2a2a2a', color: '#fff',
        position: 'sticky', top: 0, zIndex: 30, borderBottom: '1px solid #1a1a1a',
      }}>
        <button onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          style={{
            background: 'transparent', border: 'none', color: '#fff',
            fontSize: 22, cursor: 'pointer', padding: '4px 8px',
          }}>
          ☰
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: '#FF6D6E' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Social Ahorro</span>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Drawer overlay + panel */}
      {open && (
        <>
          <div className="sa-drawer-overlay" onClick={() => setOpen(false)} />
          <aside className="sa-drawer-panel">
            <div style={{ padding: '18px 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Social Ahorro</div>
                  <div style={{ fontSize: 11, color: '#999' }}>Gestión de pedidos</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                style={{ background: 'transparent', border: 'none', color: '#999', fontSize: 22, cursor: 'pointer', padding: 4 }}>
                ✕
              </button>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px', flex: 1 }}>
              <Link href="/dashboard" onClick={() => setOpen(false)} style={{ ...NAV_ITEM, background: '#3a3a3a', color: '#fff' }}>
                <span>📋</span> Pedidos
              </Link>
              <Link href="/pedidos/nuevo" onClick={() => setOpen(false)} style={NAV_ITEM}>
                <span>➕</span> Nuevo pedido
              </Link>
              <Link href="/clientes" onClick={() => setOpen(false)} style={NAV_ITEM}>
                <span>👥</span> Clientes
              </Link>
              {profile.role === 'admin' && (
                <Link href="/admin/configuracion" onClick={() => setOpen(false)} style={NAV_ITEM}>
                  <span>⚙</span> Configuración
                </Link>
              )}
            </nav>

            <div style={{ borderTop: '1px solid #1a1a1a', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{profile.name || profile.email}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{roleLabel}</div>
              </div>
              <form action="/logout" method="post">
                <button type="submit"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#d9d6d1', background: 'transparent', border: '1px solid #3a3a3a', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Salir
                </button>
              </form>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
