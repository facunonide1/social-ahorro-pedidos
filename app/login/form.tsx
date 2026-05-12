'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

import { AuthShell } from '@/components/crm/auth-shell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginForm() {
  const search = useSearchParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    search.get('error') === 'sin_permiso'
      ? 'Tu usuario no tiene acceso. Contactá al administrador.'
      : '',
  )
  const [form, setForm] = useState({ email: '', password: '' })
  const [mfa, setMfa] = useState<null | { factorId: string; challengeId: string }>(null)
  const [mfaCode, setMfaCode] = useState('')

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
    setLoading(true)
    setError('')
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (signErr) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    // Si el usuario tiene TOTP verificado, hay que subir a aal2 antes del
    // redirect. Preguntamos los factores y si hay alguno verificado, lanzamos
    // el challenge.
    const { data: assur } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assur?.nextLevel && assur.nextLevel !== assur.currentLevel && assur.nextLevel === 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find((f) => f.status === 'verified')
      if (totp) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        if (chErr || !ch) {
          setError(chErr?.message || 'mfa_challenge_failed')
          setLoading(false)
          return
        }
        setMfa({ factorId: totp.id, challengeId: ch.id })
        setLoading(false)
        return
      }
    }

    window.location.assign('/')
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault()
    if (!mfa) return
    setLoading(true)
    setError('')
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: mfa.factorId,
      challengeId: mfa.challengeId,
      code: mfaCode.trim(),
    })
    if (vErr) {
      setError('Código incorrecto. Intentá de nuevo.')
      setLoading(false)
      return
    }
    window.location.assign('/')
  }

  return (
    <AuthShell
      subtitle={
        mfa
          ? 'Ingresá el código de 6 dígitos de tu app autenticadora'
          : 'Ingresá con tu email y contraseña'
      }
    >
      <div className="mb-5 space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight">
          {mfa ? 'Verificación 2FA' : 'Panel interno'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {mfa
            ? 'Necesitamos confirmar tu identidad'
            : 'Acceso restringido a usuarios autorizados'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mfa ? (
        <form onSubmit={handleMfa} className="flex flex-col gap-3">
          <Input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            autoFocus
            className="h-14 text-center text-xl tracking-[0.5em] tabular-nums"
            aria-label="Código de 6 dígitos"
          />
          <Button
            type="submit"
            disabled={loading || mfaCode.trim().length < 6}
            className="h-12 w-full"
          >
            {loading ? 'Verificando…' : (
              <>
                Verificar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMfa(null)
              setMfaCode('')
              supabase.auth.signOut().catch(() => {})
            }}
          >
            Cancelar y volver al login
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contraseña
            </Label>
            <Input
              id="login-password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" disabled={loading} className="mt-1 h-12 w-full">
            {loading ? 'Ingresando…' : (
              <>
                Ingresar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
