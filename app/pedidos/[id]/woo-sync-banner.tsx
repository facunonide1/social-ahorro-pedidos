'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

import type { Order } from '@/lib/types'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function WooSyncBanner({ order }: { order: Order }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (order.origin !== 'woo' || !order.woo_order_id) return null
  if (!order.woo_last_sync_error) return null

  async function retry() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setMsg(`Falló: ${json?.error || 'error'}`)
        return
      }
      setMsg('Sincronizado con Woo ✓')
      router.refresh()
    } catch (e: unknown) {
      setMsg(`Falló: ${e instanceof Error ? e.message : 'red'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>Sync con WooCommerce</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          El estado local está guardado, pero <b>no se pudo sincronizar con Woo</b> (y por
          lo tanto Woo no envió el mail al cliente).
        </p>
        <p className="break-words text-xs opacity-80">{order.woo_last_sync_error}</p>
        <div className="flex items-center gap-2 pt-1">
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          <Button onClick={retry} disabled={busy} size="sm" variant="outline">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {busy ? 'Reintentando…' : 'Reintentar sync'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
