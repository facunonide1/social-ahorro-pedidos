'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserPedidos, UserRole } from '@/lib/types'

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
}

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  repartidor: 'Repartidor',
}

const ROLE_COLORS: Record<UserRole, { fg: string; bg: string; border: string }> = {
  admin:      { fg: '#FF6D6E', bg: '#fff0f0', border: '#FF6D6E' },
  operador:   { fg: '#726DFF', bg: '#eeedff', border: '#726DFF' },
  repartidor: { fg: '#1f8a4c', bg: '#eaf7ef', border: '#6FEF6C' },
}

type Draft = {
  email: string
  password: string
  name: string
  role: UserRole
}

function emptyDraft(): Draft {
  return { email: '', password: '', name: '', role: 'operador' }
}

export default function UsuariosEditor({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserPedidos[]
  currentUserId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [users, setUsers] = useState(initialUsers)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (!draft.email.trim() || !draft.password || !draft.role) {
      setErr('Email, contraseña y rol son obligatorios.'); return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: draft.email.trim(),
          password: draft.password,
          name: draft.name.trim() || null,
          role: draft.role,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      setUsers(arr => [json.user, ...arr])
      setDraft(emptyDraft())
      setMsg(`Usuario ${json.user?.email} creado.`)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  async function patchUser(u: UserPedidos, patch: Partial<Pick<UserPedidos, 'role' | 'active' | 'name'>>) {
    setErr(null)
    const { data, error } = await sb
      .from('users_pedidos')
      .update(patch)
      .eq('id', u.id)
      .select('*')
      .maybeSingle<UserPedidos>()
    if (error) { setErr(error.message); return }
    if (data) setUsers(arr => arr.map(x => x.id === data.id ? data : x))
    router.refresh()
  }

  async function removeUser(u: UserPedidos) {
    if (u.id === currentUserId) { setErr('No podés eliminar tu propio usuario.'); return }
    if (!confirm(`¿Eliminar al usuario ${u.name || u.email}? No se puede deshacer.`)) return
    setErr(null)
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      setUsers(arr => arr.filter(x => x.id !== u.id))
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>
          {msg}
        </div>
      )}

      {/* FORM CREAR */}
      <form onSubmit={createUser} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a' }}>Nuevo usuario</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })}
              placeholder="juan@socialahorro.com" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Nombre</label>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="Juan Pérez" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Rol</label>
            <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as UserRole })} style={INPUT}>
              <option value="operador">Operador</option>
              <option value="repartidor">Repartidor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </div>
        <div>
          <label style={LABEL}>Contraseña (mínimo 6 caracteres)</label>
          <input type="password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })}
            placeholder="••••••••" style={INPUT} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={busy}
            style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>

      {/* LISTA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: '#aaa', textAlign: 'center' }}>
            Todavía no hay usuarios. Creá el primero arriba.
          </div>
        )}
        {users.map(u => {
          const rc = ROLE_COLORS[u.role]
          const isSelf = u.id === currentUserId
          return (
            <div key={u.id} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center',
              background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12, padding: '10px 12px',
              opacity: u.active ? 1 : 0.55,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {u.name || u.email}
                  {isSelf && <span style={{ fontSize: 10, color: '#726DFF', marginLeft: 6, fontWeight: 700, letterSpacing: '0.3px' }}>VOS</span>}
                  {!u.active && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>(inactivo)</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
              </div>
              <select value={u.role}
                disabled={isSelf}
                onChange={e => patchUser(u, { role: e.target.value as UserRole })}
                title={isSelf ? 'No podés cambiar tu propio rol. Pedile a otro admin que lo haga.' : ''}
                style={{
                  padding: '6px 10px', fontSize: 12, fontWeight: 700,
                  background: rc.bg, color: rc.fg, border: `1.5px solid ${rc.border}`,
                  borderRadius: 999, outline: 'none',
                  cursor: isSelf ? 'not-allowed' : 'pointer',
                  opacity: isSelf ? 0.55 : 1,
                }}>
                <option value="admin">{ROLE_LABELS.admin}</option>
                <option value="operador">{ROLE_LABELS.operador}</option>
                <option value="repartidor">{ROLE_LABELS.repartidor}</option>
              </select>
              <button onClick={() => patchUser(u, { active: !u.active })}
                disabled={isSelf}
                title={isSelf ? 'No podés desactivar tu propio usuario' : ''}
                style={{
                  ...BTN, background: '#f0ede8', color: '#666', padding: '8px 12px',
                  opacity: isSelf ? 0.4 : 1,
                  cursor: isSelf ? 'not-allowed' : 'pointer',
                }}>
                {u.active ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => removeUser(u)} disabled={isSelf}
                style={{
                  ...BTN, background: '#fff', color: isSelf ? '#ccc' : '#a33',
                  border: '1.5px solid #f0ede8', padding: '8px 12px',
                  cursor: isSelf ? 'not-allowed' : 'pointer',
                }}
                title={isSelf ? 'No podés eliminar tu propio usuario' : 'Eliminar'}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
        La contraseña sólo se pide al crear el usuario. Si olvidaron la clave, usá el panel de Supabase Auth
        para enviar un reset por mail.
      </div>
    </div>
  )
}
