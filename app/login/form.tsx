'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    search.get('error') === 'sin_permiso'
      ? 'Tu usuario no tiene acceso. Contactá al administrador.'
      : ''
  )
  const [form, setForm] = useState({ email: '', password: '' })

  // Si llegamos a /login con ?error=sin_permiso pero todavía hay sesión
  // activa en supabase, la cerramos para no caer en un loop de redirect
  // (el middleware rebotaría /login -> / y / rebotaría de vuelta a /login).
  useEffect(() => {
    if (search.get('error') === 'sin_permiso') {
      supabase.auth.signOut().catch(() => {})
    }
  }, [search, supabase])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email, password: form.password,
    })
    if (error) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    // hard navigate para garantizar que las cookies de sesión viajen
    // en la siguiente request al server y el middleware vea al usuario
    window.location.assign('/')
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#faf8f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: '#fff', border: '0.5px solid #ede9e4', padding: '10px 16px',
          borderRadius: 999, fontSize: 13, fontWeight: 700, color: '#2a2a2a', letterSpacing: '-0.2px',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
          Social Ahorro · Pedidos
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: '380px', background: '#fff',
        borderRadius: '24px', padding: '28px 24px', border: '0.5px solid #ede9e4',
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#2a2a2a', marginBottom: 4, letterSpacing: '-0.4px' }}>
          Panel interno
        </h2>
        <p style={{ fontSize: 13, color: '#aaa', marginBottom: 24 }}>Ingresá con tu email y contraseña</p>

        {error && (
          <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ color: '#FF6D6E', fontSize: 13, fontWeight: 500 }}>⚠️ {error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#888', display: 'block', marginBottom: 6, letterSpacing: '0.3px' }}>EMAIL</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="tu@email.com"
              style={{ width: '100%', padding: 14, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 14, color: '#2a2a2a', background: '#faf8f5', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#888', display: 'block', marginBottom: 6, letterSpacing: '0.3px' }}>CONTRASEÑA</label>
            <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••"
              style={{ width: '100%', padding: 14, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 14, color: '#2a2a2a', background: '#faf8f5', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', background: loading ? '#ffb3b3' : '#FF6D6E', border: 'none', borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px', marginTop: 4 }}>
            {loading ? 'Ingresando...' : 'Ingresar →'}
          </button>
        </form>
      </div>
    </div>
  )
}
