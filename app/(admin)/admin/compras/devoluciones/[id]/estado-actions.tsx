'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { ESTADO_DEVOLUCION_LABELS } from '@/lib/types/admin'
import type { EstadoDevolucionProveedor } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const NEXT: Record<EstadoDevolucionProveedor, EstadoDevolucionProveedor[]> = {
  registrada: ['enviada'],
  enviada: ['nota_credito_recibida'],
  nota_credito_recibida: ['cerrada'],
  cerrada: [],
  descartada: [],
}

export default function DevolucionEstadoActions({
  devolucionId,
  currentEstado,
}: {
  devolucionId: string
  currentEstado: EstadoDevolucionProveedor
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT[currentEstado] ?? []
  if (opciones.length === 0 && currentEstado !== 'registrada') return null

  async function descartar() {
    const motivo = window.prompt('¿Por qué descartás este reclamo? (ej. diferencia a favor)')
    if (!motivo || motivo.trim().length < 3) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/compras/devoluciones/efectos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ devolucion_id: devolucionId, accion: 'descartar', motivo: motivo.trim() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      router.refresh()
    } catch (e: any) { setErr(e?.message ?? 'Error'); setBusy(false) }
  }

  async function change(next: EstadoDevolucionProveedor) {
    setBusy(true)
    setErr(null)
    const { error } = await sb
      .from('devoluciones_proveedor')
      .update({ estado: next })
      .eq('id', devolucionId)
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    // Al enviarse: descuenta stock + nota de crédito esperada + score (idempotente)
    if (next === 'enviada') {
      try {
        await fetch('/api/compras/devoluciones/efectos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ devolucion_id: devolucionId }) })
      } catch { /* no bloquea el cambio de estado */ }
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Avanzar estado
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
              variant={s === 'enviada' ? 'default' : 'outline'}
              size="sm"
              disabled={busy}
              onClick={() => change(s)}
            >
              <ArrowRight className="size-3.5" />
              {s === 'enviada' ? 'Confirmar envío' : ESTADO_DEVOLUCION_LABELS[s]}
            </Button>
          ))}
          {currentEstado === 'registrada' && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={descartar} className="text-muted-foreground">
              Descartar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
