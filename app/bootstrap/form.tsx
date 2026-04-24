'use client'

import { useEffect, useState } from 'react'

type Status =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'already_bootstrapped' }
  | { kind: 'schema_missing'; hint: string }

const INPUT: React.CSSProperties = {
  width: '100%', padding: 14, border: '1.5px solid #f0ede8', borderRadius: 12,
  fontSize: 14, color: '#2a2a2a', background: '#faf8f5', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#888', display: 'block',
  marginBottom: 6, letterSpacing: '0.3px',
}

export default function BootstrapForm() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<{ email: string } | null>(null)
  const [form, setForm] = useState({
    nombre:   'Admin Principal',
    email:    'admin@socialahorro.com.ar',
    password: '',
  })

  useEffect(() => {
    fetch('/api/admin/bootstrap')
      .then(r => r.json())
      .then(j => {
        if (j?.error === 'users_admin_no_existe_o_sin_acceso') {
          setStatus({ kind: 'schema_missing', hint: j.hint ?? '' })
        } else if (j?.bootstrapped) {
          setStatus({ kind: 'already_bootstrapped' })
        } else {
          setStatus({ kind: 'ready' })
        }
      })
      .catch(() => setStatus({ kind: 'schema_missing', hint: 'No pude consultar el estado.' }))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (form.password.length < 8) {
      setErr('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      setOk({ email: json.email })
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
    }
  }

  if (status.kind === 'checking') {
    return <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center' }}>Chequeando estado…</div>
  }

  if (status.kind === 'schema_missing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#a33', margin: 0 }}>
          Falta aplicar migraciones
        </h2>
        <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>
          Antes de crear el primer administrador hay que correr las migraciones{' '}
          <code>0017_fix_handle_new_user_trigger.sql</code> y{' '}
          <code>0016_admin_hub_schema.sql</code> (en ese orden) en el SQL Editor de Supabase.
        </p>
        {status.hint && (
          <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{status.hint}</p>
        )}
        <button onClick={() => location.reload()}
          style={{ padding: 12, background: '#726DFF', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
          Ya las corrí, revisar de nuevo
        </button>
      </div>
    )
  }

  if (status.kind === 'already_bootstrapped') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, textAlign: 'center' }}>
          El Admin Hub ya está configurado
        </h2>
        <p style={{ fontSize: 13, color: '#666', textAlign: 'center', margin: 0 }}>
          Ya existe al menos un super_admin activo. Para agregar más usuarios, iniciá sesión con uno existente.
        </p>
        <a href="/login"
          style={{ padding: '12px 20px', background: '#FF6D6E', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
          Ir al login
        </a>
      </div>
    )
  }

  if (ok) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, textAlign: 'center' }}>
          Super admin creado
        </h2>
        <div style={{ fontSize: 13, color: '#555', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '10px 14px', borderRadius: 10, width: '100%', textAlign: 'center' }}>
          <b>{ok.email}</b>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0, textAlign: 'center' }}>
          Guardá la contraseña que elegiste — no la podemos recuperar desde acá.
        </p>
        <a href="/login"
          style={{ padding: '12px 20px', background: '#FF6D6E', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}>
          Ir al login →
        </a>
      </div>
    )
  }

  // status.kind === 'ready'
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2a2a2a', margin: 0, letterSpacing: '-0.3px' }}>
        Crear primer super_admin
      </h2>
      <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
        Este formulario se desactiva apenas exista un super_admin. Elegí una contraseña fuerte y anotá los datos.
      </p>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#FF6D6E' }}>
          ⚠ {err}
        </div>
      )}

      <div>
        <label style={LABEL}>NOMBRE</label>
        <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
          placeholder="Admin Principal" style={INPUT} />
      </div>

      <div>
        <label style={LABEL}>EMAIL</label>
        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
          placeholder="admin@socialahorro.com.ar" style={INPUT} />
      </div>

      <div>
        <label style={LABEL}>CONTRASEÑA (mínimo 8)</label>
        <input type="password" required minLength={8} value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          placeholder="••••••••" style={INPUT} />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
          Sugerencia: mezclá mayúsculas, números y al menos un símbolo.
        </div>
      </div>

      <button type="submit" disabled={busy}
        style={{ padding: 16, background: busy ? '#ffb3b3' : '#FF6D6E', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? 'Creando…' : 'Crear super_admin →'}
      </button>
    </form>
  )
}
