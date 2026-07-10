'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, ArrowRight, Hash, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

import { NoraLogo } from '@/components/nora/nora-logo'
import PinLogin from './pin-login'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const loginSchema = z.object({
  email: z.email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

const mfaSchema = z.object({
  code: z
    .string()
    .min(6, 'El código tiene 6 dígitos')
    .max(6, 'El código tiene 6 dígitos')
    .regex(/^\d+$/, 'Solo números'),
})

type LoginValues = z.infer<typeof loginSchema>
type MfaValues = z.infer<typeof mfaSchema>

export default function LoginForm() {
  const search = useSearchParams()
  const supabase = createClient()
  const redirectTo = search.get('redirectTo') || '/'

  const [authError, setAuthError] = useState(
    search.get('error') === 'sin_permiso'
      ? 'Esta cuenta no tiene acceso al panel'
      : '',
  )
  const [mfa, setMfa] = useState<null | { factorId: string; challengeId: string }>(null)
  const [modo, setModo] = useState<'email' | 'pin'>('email')

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const mfaForm = useForm<MfaValues>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { code: '' },
  })

  // Si llegamos a /login con ?error=sin_permiso pero todavía hay sesión
  // activa en supabase, la cerramos para no caer en un loop de redirect.
  useEffect(() => {
    if (search.get('error') === 'sin_permiso') {
      supabase.auth.signOut().catch(() => {})
    }
  }, [search, supabase])

  async function onLogin(values: LoginValues) {
    setAuthError('')
    const { error: signErr } = await supabase.auth.signInWithPassword(values)
    if (signErr) {
      setAuthError('Email o contraseña incorrectos')
      return
    }

    // MFA TOTP: si hay factor verificado, escalar a aal2 antes del redirect.
    const { data: assur } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assur?.nextLevel && assur.nextLevel !== assur.currentLevel && assur.nextLevel === 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find((f) => f.status === 'verified')
      if (totp) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        if (chErr || !ch) {
          setAuthError(chErr?.message || 'No pudimos iniciar la verificación 2FA')
          return
        }
        setMfa({ factorId: totp.id, challengeId: ch.id })
        return
      }
    }

    window.location.assign(redirectTo)
  }

  async function onMfa(values: MfaValues) {
    if (!mfa) return
    setAuthError('')
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: mfa.factorId,
      challengeId: mfa.challengeId,
      code: values.code.trim(),
    })
    if (vErr) {
      setAuthError('Código incorrecto. Intentá de nuevo.')
      mfaForm.reset({ code: '' })
      return
    }
    window.location.assign(redirectTo)
  }

  function cancelMfa() {
    setMfa(null)
    mfaForm.reset({ code: '' })
    supabase.auth.signOut().catch(() => {})
  }

  const loginBusy = loginForm.formState.isSubmitting
  const mfaBusy = mfaForm.formState.isSubmitting

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel marketing (oculto en mobile) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-nora via-nora to-mint p-10 text-white lg:flex">
        <div className="flex items-center gap-2 font-bold tracking-tight">
          <NoraLogo size="md" />
          NORA HQ
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Tu centro de mando inteligente
          </h1>
          <p className="mt-3 text-sm text-white/80">
            Powered by NORA · IA para tu cadena
          </p>
        </div>
        <p className="text-[11px] text-white/60">
          Social Ahorro Farmacias · {new Date().getFullYear()}
        </p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 font-bold tracking-tight lg:hidden">
            <NoraLogo size="md" />
            NORA HQ
          </div>
          {modo === 'pin' ? (
            <PinLogin onVolver={() => setModo('email')} />
          ) : (
          <>
          <div className="mb-5 space-y-1.5">
            <h2 className="text-xl font-bold tracking-tight">
              {mfa ? 'Verificación 2FA' : 'Iniciar sesión'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mfa
                ? 'Ingresá el código de 6 dígitos de tu app autenticadora'
                : 'Accedé a tu cuenta del panel interno'}
            </p>
          </div>

      {authError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      )}

      {mfa ? (
        <Form {...mfaForm}>
          <form onSubmit={mfaForm.handleSubmit(onMfa)} className="flex flex-col gap-3">
            <FormField
              control={mfaForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Código de 6 dígitos</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      autoFocus
                      className="h-14 text-center text-xl tracking-[0.5em] tabular-nums"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={mfaBusy} className="h-12 w-full">
              {mfaBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Verificar
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancelMfa}>
              Cancelar y volver al login
            </Button>
          </form>
        </Form>
      ) : (
        <Form {...loginForm}>
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="flex flex-col gap-4">
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="tu@email.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={loginForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Contraseña
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={loginBusy} className="mt-1 h-12 w-full">
              {loginBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Ingresando…
                </>
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="pt-1 text-center text-xs text-muted-foreground">
              ¿Olvidaste tu contraseña? Pedile al administrador que te la resetee.
            </p>
          </form>
        </Form>
      )}

          {!mfa && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">o</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                onClick={() => setModo('pin')}
              >
                <Hash className="size-4" />
                Ingresá con N° de empleado y PIN
              </Button>
            </>
          )}
          </>
          )}

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Social Ahorro · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
