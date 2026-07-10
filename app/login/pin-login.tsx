'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, ArrowRight, Delete, Loader2, User } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ingresarConPinAction } from './actions'

/**
 * Login por N° de empleado + PIN (mobile-first, tipo "fichar").
 * Dos pasos: 1) N° de empleado · 2) PIN de 4 dígitos con teclado numérico.
 * El PIN se auto-envía al completar los 4 dígitos.
 */
export default function PinLogin({ onVolver }: { onVolver: () => void }) {
  const search = useSearchParams()
  const redirectTo = search.get('redirectTo') || '/'

  const [paso, setPaso] = useState<'numero' | 'pin'>('numero')
  const [numero, setNumero] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function tecla(d: string) {
    setError('')
    if (paso === 'numero') {
      if (numero.length < 10) setNumero((n) => n + d)
    } else {
      if (pin.length < 4) {
        const next = pin + d
        setPin(next)
        if (next.length === 4) enviar(next)
      }
    }
  }

  function borrar() {
    setError('')
    if (paso === 'numero') setNumero((n) => n.slice(0, -1))
    else setPin((p) => p.slice(0, -1))
  }

  function continuar() {
    if (!numero) {
      setError('Ingresá tu N° de empleado.')
      return
    }
    setPaso('pin')
    setPin('')
    setError('')
  }

  function enviar(pinCompleto: string) {
    startTransition(async () => {
      const res = await ingresarConPinAction(numero, pinCompleto)
      if (res.ok) {
        window.location.assign(redirectTo)
        return
      }
      setError(res.error)
      setPin('')
    })
  }

  const valor = paso === 'numero' ? numero : pin

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight">Ingreso de empleado</h2>
        <p className="text-xs text-muted-foreground">
          {paso === 'numero'
            ? 'Ingresá tu número de empleado'
            : `Empleado N° ${numero} · ingresá tu PIN`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Display */}
      {paso === 'numero' ? (
        <div className="flex h-16 items-center justify-center rounded-xl border bg-muted/40 text-3xl font-semibold tabular-nums tracking-wide">
          {numero || <span className="text-muted-foreground/50">N° empleado</span>}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 py-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-5 rounded-full border-2 transition-colors ${
                i < pin.length ? 'border-nora bg-nora' : 'border-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <KeyBtn key={d} onClick={() => tecla(d)} disabled={pending}>
            {d}
          </KeyBtn>
        ))}
        <KeyBtn onClick={onVolver} disabled={pending} variant="ghost">
          <User className="size-5" />
        </KeyBtn>
        <KeyBtn onClick={() => tecla('0')} disabled={pending}>
          0
        </KeyBtn>
        <KeyBtn onClick={borrar} disabled={pending || valor.length === 0} variant="ghost">
          <Delete className="size-5" />
        </KeyBtn>
      </div>

      {paso === 'numero' ? (
        <Button className="h-12 w-full" onClick={continuar} disabled={pending || !numero}>
          Continuar
          <ArrowRight className="size-4" />
        </Button>
      ) : (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => { setPaso('numero'); setPin(''); setError('') }} disabled={pending}>
            <ArrowLeft className="size-4" />
            Cambiar N°
          </Button>
          {pending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Ingresando…
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function KeyBtn({
  children,
  onClick,
  disabled,
  variant = 'outline',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'outline' | 'ghost'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-16 items-center justify-center rounded-xl text-2xl font-semibold tabular-nums transition-colors active:scale-[0.97] disabled:opacity-40 ${
        variant === 'outline'
          ? 'border bg-background hover:bg-muted'
          : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}
