'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquare, Truck } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export default function RepartidorRowActions({ order }: { order: Order }) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')

  async function go(status: OrderStatus) {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error_cambio_estado')
        return
      }
      if (json?.woo && json.woo.ok === false) {
        setErr(`Guardado OK, pero no se sincronizó con Woo: ${json.woo.error}`)
      }
      setNote('')
      setShowNote(false)
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    if (!note.trim()) return
    setBusy(true)
    setErr(null)
    const { error } = await sb.rpc('add_order_note', {
      p_order_id: order.id,
      p_note: note.trim(),
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setNote('')
    setShowNote(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {showNote && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Observación (opcional)"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {order.status !== 'en_camino' && order.status !== 'entregado' && (
          <Button onClick={() => go('en_camino')} disabled={busy} variant="secondary" className="h-12 flex-1">
            <Truck className="size-4" />
            Salgo con el pedido
          </Button>
        )}
        {order.status !== 'entregado' && (
          <Button onClick={() => go('entregado')} disabled={busy} className="h-12 flex-1">
            <Check className="size-4" />
            Entregado
          </Button>
        )}
        <Button
          onClick={() => setShowNote((v) => !v)}
          disabled={busy}
          variant="outline"
          className="h-12"
        >
          <MessageSquare className="size-4" />
          {showNote ? 'Ocultar nota' : 'Nota'}
        </Button>
        {showNote && note.trim() && (
          <Button onClick={saveNote} disabled={busy} variant="secondary" className="h-12">
            Guardar nota
          </Button>
        )}
      </div>
    </div>
  )
}
