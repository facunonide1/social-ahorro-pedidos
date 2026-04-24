'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole, Sucursal } from '@/lib/types/admin'
import type { UsuarioRow } from './page'

const BTN: React.CSSProperties = {
  padding: '8px 12px', border: 'none', borderRadius: 10,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1.5px solid #f0ede8',
  borderRadius: 10, fontSize: 13, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const ALL_ROLES: AdminRole[] = ['super_admin','gerente','comprador','administrativo','tesoreria','auditor','sucursal']

const ROLE_COLORS: Record<AdminRole, { fg: string; bg: string; border: string }> = {
  super_admin:    { fg: '#FF6D6E', bg: '#fff0f0', border: '#FF6D6E' },
  gerente:        { fg: '#726DFF', bg: '#eeedff', border: '#726DFF' },
  comprador:      { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  administrativo: { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  tesoreria:      { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  auditor:        { fg: '#555',    bg: '#f5f5f5', border: '#e2e2e2' },
  sucursal:       { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
}

export default function UsuariosEditor({
  initialUsers, sucursales, currentUserId,
}: {
  initialUsers: UsuarioRow[]
  sucursales: Pick<Sucursal,'id'|'nombre'|'activa'>[]
  currentUserId: string
}) {
  const router = useRouter()
  const [users, setUsers] = useState<UsuarioRow[]>(initialUsers)
  const [creating, setCreating] = useState<{ email: string; nombre: string; password: string; rol: AdminRole; sucursal_id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function createUser() {
    if (!creating) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch('/api/hub/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: creating.email, password: creating.password, nombre: creating.nombre,
          rol: creating.rol,
          sucursal_id: creating.rol === 'sucursal' ? creating.sucursal_id : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      setMsg(`Usuario ${json.email} creado.`)
      setCreating(null)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  async function patch(u: UsuarioRow, body: { rol?: AdminRole; sucursal_id?: string | null; activo?: boolean }) {
    setErr(null)
    const res = await fetch(`/api/hub/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json?.error || 'error'); return }
    if (json.user) setUsers(arr => arr.map(x => x.id === u.id ? { ...x, ...json.user } : x))
    router.refresh()
  }

  async function remove(u: UsuarioRow) {
    if (!confirm(`¿Eliminar a ${u.nombre || u.email}? No se puede deshacer.`)) return
    setErr(null)
    const res = await fetch(`/api/hub/usuarios/${u.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { setErr(json?.error || 'error'); return }
    setUsers(arr => arr.filter(x => x.id !== u.id))
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>}
      {msg && <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>{msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setCreating(creating ? null : { email: '', nombre: '', password: '', rol: 'administrativo', sucursal_id: '' })}
          style={{ ...BTN, background: creating ? '#f0ede8' : '#FF6D6E', color: creating ? '#666' : '#fff', padding: '10px 14px' }}>
          {creating ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {creating && (
        <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a' }}>Crear usuario</div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10 }}>
            <input placeholder="Email" type="email" value={creating.email} onChange={e => setCreating({ ...creating, email: e.target.value })} style={INPUT} />
            <input placeholder="Nombre" value={creating.nombre} onChange={e => setCreating({ ...creating, nombre: e.target.value })} style={INPUT} />
            <select value={creating.rol} onChange={e => setCreating({ ...creating, rol: e.target.value as AdminRole })} style={INPUT}>
              {ALL_ROLES.map(r => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: creating.rol === 'sucursal' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <input placeholder="Contraseña (mín 8)" type="password" value={creating.password}
              onChange={e => setCreating({ ...creating, password: e.target.value })} style={INPUT} />
            {creating.rol === 'sucursal' && (
              <select value={creating.sucursal_id} onChange={e => setCreating({ ...creating, sucursal_id: e.target.value })} style={INPUT}>
                <option value="">Sucursal asignada…</option>
                {sucursales.filter(s => s.activa).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={createUser} disabled={busy}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff' }}>
              {busy ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.length === 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 14, padding: 24, textAlign: 'center', color: '#aaa' }}>
            Sin usuarios.
          </div>
        )}
        {users.map(u => {
          const rc = ROLE_COLORS[u.rol]
          const isSelf = u.id === currentUserId
          return (
            <div key={u.id} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 10, alignItems: 'center',
              background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12, padding: '10px 12px',
              opacity: u.activo ? 1 : 0.55,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {u.nombre || u.email}
                  {isSelf && <span style={{ fontSize: 10, color: '#726DFF', marginLeft: 6, fontWeight: 700, letterSpacing: '0.3px' }}>VOS</span>}
                  {!u.activo && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>(inactivo)</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                {u.sucursal_nombre && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>📍 {u.sucursal_nombre}</div>}
              </div>
              <select value={u.rol}
                disabled={isSelf}
                onChange={e => patch(u, { rol: e.target.value as AdminRole })}
                title={isSelf ? 'No podés cambiar tu propio rol' : ''}
                style={{
                  padding: '6px 10px', fontSize: 11, fontWeight: 700,
                  background: rc.bg, color: rc.fg, border: `1.5px solid ${rc.border}`,
                  borderRadius: 999, outline: 'none',
                  cursor: isSelf ? 'not-allowed' : 'pointer',
                  opacity: isSelf ? 0.55 : 1,
                }}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
              </select>
              {u.rol === 'sucursal' ? (
                <select value={u.sucursal_id ?? ''}
                  disabled={isSelf}
                  onChange={e => patch(u, { sucursal_id: e.target.value || null })}
                  style={{ ...INPUT, padding: '6px 10px', fontSize: 12 }}>
                  <option value="">— Sin sucursal —</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              ) : <div />}
              <button onClick={() => patch(u, { activo: !u.activo })}
                disabled={isSelf}
                title={isSelf ? 'No podés desactivarte a vos mismo' : ''}
                style={{ ...BTN, background: '#f0ede8', color: '#666',
                  opacity: isSelf ? 0.4 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}>
                {u.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => remove(u)}
                disabled={isSelf}
                style={{ ...BTN, background: '#fff', color: isSelf ? '#ccc' : '#a33',
                  border: '1.5px solid #f0ede8',
                  cursor: isSelf ? 'not-allowed' : 'pointer' }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
        Para resetear la contraseña de alguien, usá el panel Authentication de Supabase
        (no exponemos endpoint para evitar tomar la cuenta de otros admins).
      </div>
    </div>
  )
}
