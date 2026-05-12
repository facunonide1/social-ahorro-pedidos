'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

type Factor = {
  id: string
  friendly_name?: string
  factor_type: string
  status: string
}

export default function MfaSection() {
  const sb = createClient()
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [enrolling, setEnrolling] = useState<null | {
    factorId: string
    qr: string
    secret: string
  }>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setErr(null)
    const { data, error } = await sb.auth.mfa.listFactors()
    if (error) {
      setErr(error.message)
      setLoading(false)
      return
    }
    setFactors((data?.totp ?? []) as Factor[])
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verified = factors.find((f) => f.status === 'verified')

  async function startEnroll() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) {
      setEnrolling({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      })
    }
  }

  async function confirmEnroll() {
    if (!enrolling) return
    setBusy(true)
    setErr(null)
    const challenge = await sb.auth.mfa.challenge({ factorId: enrolling.factorId })
    if (challenge.error) {
      setErr(challenge.error.message)
      setBusy(false)
      return
    }
    const verify = await sb.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    })
    setBusy(false)
    if (verify.error) {
      setErr(verify.error.message)
      return
    }
    setMsg('2FA activado. Próxima vez que ingreses te vamos a pedir el código.')
    setEnrolling(null)
    setCode('')
    load()
  }

  async function cancelEnroll() {
    if (!enrolling) return
    await sb.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {})
    setEnrolling(null)
    setCode('')
    load()
  }

  async function disable() {
    if (!verified) return
    if (!confirm('¿Desactivar 2FA? Tu cuenta volverá a pedir solo contraseña.')) return
    setBusy(true)
    setErr(null)
    const { error } = await sb.auth.mfa.unenroll({ factorId: verified.id })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('2FA desactivado.')
    load()
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-32" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {err && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      {verified && !enrolling && (
        <div className="flex flex-col gap-3">
          <Alert variant="success">
            <ShieldCheck className="size-4" />
            <AlertTitle>2FA activo</AlertTitle>
            <AlertDescription>
              Tu cuenta requiere código del autenticador al iniciar sesión.
            </AlertDescription>
          </Alert>
          <Button
            onClick={disable}
            disabled={busy}
            variant="outline"
            className="self-start text-destructive hover:text-destructive"
          >
            Desactivar 2FA
          </Button>
        </div>
      )}

      {!verified && !enrolling && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Sumá una segunda capa de seguridad usando Google Authenticator, 1Password, Authy o cualquier app TOTP.
          </p>
          <Button onClick={startEnroll} disabled={busy} className="self-start">
            Activar 2FA
          </Button>
        </div>
      )}

      {enrolling && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="text-sm">
            <span className="font-semibold">1.</span> Escaneá este QR con tu app autenticadora.
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrolling.qr}
            alt="QR para 2FA"
            className="size-48 self-center rounded-md border border-border bg-background"
          />
          <div className="text-xs text-muted-foreground">
            Si no podés escanear, ingresá esta clave manualmente:{' '}
            <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
              {enrolling.secret}
            </code>
          </div>

          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-semibold">2.</span> Ingresá el código de 6 dígitos:
            </div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              className="h-12 text-center text-lg tracking-[0.5em] tabular-nums"
              aria-label="Código de 6 dígitos"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={cancelEnroll} disabled={busy} variant="outline">
              Cancelar
            </Button>
            <Button
              onClick={confirmEnroll}
              disabled={busy || code.trim().length < 6}
            >
              {busy ? 'Verificando…' : 'Confirmar y activar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
