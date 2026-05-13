'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'
import { FACTURA_ESTADO_VARIANT, type FacturaBadgeVariant } from '@/lib/admin-hub/factura'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const NEXT_ESTADOS: Record<FacturaEstado, FacturaEstado[]> = {
  borrador: ['pendiente_aprobacion', 'aprobada', 'anulada'],
  pendiente_aprobacion: ['aprobada', 'rechazada'],
  aprobada: ['programada_pago', 'rechazada'],
  programada_pago: ['pagada_parcial', 'pagada'],
  pagada_parcial: ['pagada'],
  pagada: [],
  vencida: ['programada_pago', 'pagada'],
  rechazada: ['borrador'],
  anulada: [],
}

const VARIANT_BUTTON_CLASS: Record<FacturaBadgeVariant, string> = {
  outline: 'border-border text-foreground hover:bg-accent',
  warning: 'border-warning/40 text-warning hover:bg-warning/10',
  info: 'border-primary/40 text-primary hover:bg-primary/10',
  success: 'border-success/40 text-success hover:bg-success/10',
  destructive: 'border-destructive/40 text-destructive hover:bg-destructive/10',
  secondary: 'border-border text-muted-foreground hover:bg-muted',
}

export default function EstadoActions({
  facturaId,
  currentEstado,
}: {
  facturaId: string
  currentEstado: FacturaEstado
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT_ESTADOS[currentEstado]
  if (opciones.length === 0) return null

  async function change(next: FacturaEstado) {
    setBusy(true)
    setErr(null)
    const patch: Record<string, unknown> = { estado: next }
    if (next === 'aprobada') {
      patch.approved_by = (await sb.auth.getUser()).data.user?.id ?? null
    }
    const { error } = await sb
      .from('facturas_proveedor')
      .update(patch)
      .eq('id', facturaId)
    setBusy(false)
    if (error) {
      setErr(error.message)
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
            const variant = FACTURA_ESTADO_VARIANT[s]
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
                {FACTURA_ESTADO_LABELS[s]}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
