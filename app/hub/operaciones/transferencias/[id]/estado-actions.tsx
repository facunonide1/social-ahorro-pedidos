'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { ESTADO_TRANSFERENCIA_LABELS } from '@/lib/types/admin'
import type { EstadoTransferencia } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const NEXT: Record<EstadoTransferencia, EstadoTransferencia[]> = {
  solicitada: ['aprobada', 'cancelada'],
  aprobada: ['en_transito', 'cancelada'],
  en_transito: ['recibida'],
  recibida: [],
  cancelada: [],
}

const FECHA_FIELD: Partial<Record<EstadoTransferencia, string>> = {
  en_transito: 'fecha_envio',
  recibida: 'fecha_recepcion',
}

export default function TransferenciaEstadoActions({
  transferenciaId,
  currentEstado,
}: {
  transferenciaId: string
  currentEstado: EstadoTransferencia
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT[currentEstado]
  if (opciones.length === 0) return null

  async function change(next: EstadoTransferencia) {
    setBusy(true)
    setErr(null)
    const patch: Record<string, unknown> = { estado: next }
    const fechaField = FECHA_FIELD[next]
    if (fechaField) patch[fechaField] = new Date().toISOString()
    const { error } = await sb
      .from('transferencias_sucursal')
      .update(patch)
      .eq('id', transferenciaId)
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
          {opciones.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => change(s)}
            >
              <ArrowRight className="size-3.5" />
              {ESTADO_TRANSFERENCIA_LABELS[s]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
