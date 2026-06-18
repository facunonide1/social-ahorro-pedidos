'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import { PAGO_ESTADO_LABELS } from '@/lib/types/admin'
import type { PagoEstado } from '@/lib/types/admin'
import { PAGO_ESTADO_VARIANT } from '@/lib/admin-hub/pago'
import type { FacturaBadgeVariant } from '@/lib/admin-hub/factura'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const NEXT_ESTADOS: Record<PagoEstado, PagoEstado[]> = {
  solicitado: ['aprobado', 'anulado'],
  aprobado: ['ejecutado', 'anulado'],
  ejecutado: ['conciliado', 'anulado'],
  conciliado: [],
  anulado: [],
}

const VARIANT_BUTTON_CLASS: Record<FacturaBadgeVariant, string> = {
  outline: 'border-border text-foreground hover:bg-accent',
  warning: 'border-warning/40 text-warning hover:bg-warning/10',
  info: 'border-primary/40 text-primary hover:bg-primary/10',
  success: 'border-success/40 text-success hover:bg-success/10',
  destructive: 'border-destructive/40 text-destructive hover:bg-destructive/10',
  secondary: 'border-border text-muted-foreground hover:bg-muted',
}

export default function PagoEstadoActions({
  pagoId,
  currentEstado,
}: {
  pagoId: string
  currentEstado: PagoEstado
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT_ESTADOS[currentEstado]
  if (opciones.length === 0) return null

  async function change(next: PagoEstado) {
    if (
      next === 'anulado' &&
      !window.confirm(
        'Anular el pago revierte las facturas asociadas. ¿Confirmás?',
      )
    )
      return
    setBusy(true)
    setErr(null)
    const res = await fetch(`/api/hub/pagos/${pagoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: next }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(json.hint || json.error || 'Error al cambiar el estado.')
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cambiar estado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {opciones.map((s) => {
            const variant = PAGO_ESTADO_VARIANT[s]
            return (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => change(s)}
                className={cn(VARIANT_BUTTON_CLASS[variant])}
              >
                <ArrowRight className="size-3.5" />
                {PAGO_ESTADO_LABELS[s]}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
