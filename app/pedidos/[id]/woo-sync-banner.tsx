'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Order } from '@/lib/types'

export default function WooSyncBanner({ order }: { order: Order }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (order.origin !== 'woo' || !order.woo_order_id) return null
  if (!order.woo_last_sync_error) return null

  async function retry() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setMsg(`Falló: ${json?.error || 'error'}`); return }
      setMsg('Sincronizado con Woo ✓')
      router.refresh()
    } catch (e: any) {
      setMsg(`Falló: ${e?.message || 'red'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{
      background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 320px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#c6831a', letterSpacing: '0.4px', marginBottom: 2 }}>
          SYNC CON WOOCOMMERCE
        </div>
        <div style={{ fontSize: 13, color: '#2a2a2a' }}>
          El estado local está guardado, pero <b>no se pudo sincronizar con Woo</b> (y por lo tanto Woo no envió el mail al cliente).
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4, wordBreak: 'break-word' }}>
          {order.woo_last_sync_error}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {msg && <span style={{ fontSize: 12, color: '#666' }}>{msg}</span>}
        <button onClick={retry} disabled={busy}
          style={{
            padding: '10px 14px', border: 'none', borderRadius: 12,
            background: '#c6831a', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
          }}>
          {busy ? 'Reintentando…' : 'Reintentar sync'}
        </button>
      </div>
    </section>
  )
}
