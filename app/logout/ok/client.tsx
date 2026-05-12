'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ArrowRight } from 'lucide-react'

import { AuthShell } from '@/components/crm/auth-shell'
import { Button } from '@/components/ui/button'

const REDIRECT_SECONDS = 5

export default function LogoutOkClient() {
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    const timeout = setTimeout(() => {
      window.location.assign('/login')
    }, REDIRECT_SECONDS * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <AuthShell subtitle="Hasta la próxima">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CheckCircle2 className="size-12 text-success" aria-hidden />
        <h2 className="text-xl font-bold tracking-tight">Cerraste sesión</h2>
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          Te llevamos al login en{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {secondsLeft}
          </span>{' '}
          {secondsLeft === 1 ? 'segundo' : 'segundos'}…
        </p>

        <Button asChild className="mt-2 w-full">
          <a href="/login">
            Iniciar sesión de nuevo
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
    </AuthShell>
  )
}
