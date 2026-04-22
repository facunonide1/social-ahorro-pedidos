'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string }

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

export default function MfaSection() {
  const sb = createClient()
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // State para enrollment en curso
  const [enrolling, setEnrolling] = useState<null | { factorId: string; qr: string; secret: string }>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true); setErr(null)
    const { data, error } = await sb.auth.mfa.listFactors()
    if (error) { setErr(error.message); setLoading(false); return }
    setFactors((data?.totp ?? []) as Factor[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const verified = factors.find(f => f.status === 'verified')

  async function startEnroll() {
    setErr(null); setMsg(null); setBusy(true)
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data) setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirmEnroll() {
    if (!enrolling) return
    setBusy(true); setErr(null)
    const challenge = await sb.auth.mfa.challenge({ factorId: enrolling.factorId })
    if (challenge.error) { setErr(challenge.error.message); setBusy(false); return }
    const verify = await sb.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    })
    setBusy(false)
    if (verify.error) { setErr(verify.error.message); return }
    setMsg('2FA activado. Próxima vez que ingreses te vamos a pedir el código.')
    setEnrolling(null); setCode('')
    load()
  }

  async function cancelEnroll() {
    if (!enrolling) return
    await sb.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {})
    setEnrolling(null); setCode('')
    load()
  }

  async function disable() {
    if (!verified) return
    if (!confirm('¿Desactivar 2FA? Tu cuenta volverá a pedir solo contraseña.')) return
    setBusy(true); setErr(null)
    const { error } = await sb.auth.mfa.unenroll({ factorId: verified.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg('2FA desactivado.')
    load()
  }

  if (loading) return <div style={{ fontSize: 13, color: '#aaa' }}>Cargando…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>{msg}</div>
      )}

      {verified && !enrolling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f8a4c' }}>2FA activo</div>
              <div style={{ fontSize: 12, color: '#2a2a2a' }}>Tu cuenta requiere código del autenticador al iniciar sesión.</div>
            </div>
          </div>
          <button onClick={disable} disabled={busy}
            style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8', alignSelf: 'flex-start' }}>
            Desactivar 2FA
          </button>
        </div>
      )}

      {!verified && !enrolling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#555' }}>
            Sumá una segunda capa de seguridad usando Google Authenticator, 1Password, Authy o cualquier app TOTP.
          </div>
          <button onClick={startEnroll} disabled={busy}
            style={{ ...BTN, background: '#726DFF', color: '#fff', alignSelf: 'flex-start' }}>
            Activar 2FA
          </button>
        </div>
      )}

      {enrolling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, color: '#2a2a2a' }}>
            <b>1.</b> Escaneá este QR con tu app autenticadora.
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt="QR para 2FA" style={{ width: 200, height: 200, background: '#fff', borderRadius: 8, alignSelf: 'center', border: '0.5px solid #ede9e4' }} />
          <div style={{ fontSize: 12, color: '#666' }}>
            Si no podés escanear, ingresá esta clave manualmente: <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4, border: '0.5px solid #ede9e4' }}>{enrolling.secret}</code>
          </div>

          <div>
            <div style={{ fontSize: 13, color: '#2a2a2a', marginBottom: 6 }}>
              <b>2.</b> Ingresá el código de 6 dígitos que te muestra la app:
            </div>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456"
              inputMode="numeric" maxLength={6} style={{ ...INPUT, letterSpacing: 8, textAlign: 'center', fontSize: 18 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancelEnroll} disabled={busy}
              style={{ ...BTN, background: '#fff', color: '#666', border: '1.5px solid #f0ede8' }}>
              Cancelar
            </button>
            <button onClick={confirmEnroll} disabled={busy || code.trim().length < 6}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff' }}>
              {busy ? 'Verificando…' : 'Confirmar y activar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
