'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@/lib/types'

export default function RepartidorRowActions({ order }: { order: Order }) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')

  async function go(status: OrderStatus) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error_cambio_estado'); return }
      if (json?.woo && json.woo.ok === false) {
        setErr(`Guardado OK, pero no se sincronizó con Woo: ${json.woo.error}`)
      }
      setNote(''); setShowNote(false)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    if (!note.trim()) return
    setBusy(true); setErr(null)
    const { error } = await sb.rpc('add_order_note', {
      p_order_id: order.id,
      p_note: note.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNote(''); setShowNote(false)
    router.refresh()
  }

  const BTN: React.CSSProperties = {
    flex: '1 1 120px', padding: '12px 14px', borderRadius: 12,
    fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 8, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {showNote && (
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder="Observación (opcional)"
          style={{ width: '100%', padding: 10, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 13, background: '#faf8f5', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', color: '#2a2a2a' }} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {order.status !== 'en_camino' && order.status !== 'entregado' && (
          <button onClick={() => go('en_camino')} disabled={busy}
            style={{ ...BTN, background: '#e9f0ff', color: '#2855c7' }}>
            Salgo con el pedido
          </button>
        )}
        {order.status !== 'entregado' && (
          <button onClick={() => go('entregado')} disabled={busy}
            style={{ ...BTN, background: '#FF6D6E', color: '#fff' }}>
            ✓ Entregado
          </button>
        )}
        <button onClick={() => setShowNote(v => !v)} disabled={busy}
          style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', flex: '0 0 auto', padding: '12px 16px' }}>
          {showNote ? 'Ocultar' : 'Nota'}
        </button>
        {showNote && note.trim() && (
          <button onClick={saveNote} disabled={busy}
            style={{ ...BTN, background: '#f0ede8', color: '#666', flex: '0 0 auto', padding: '12px 16px' }}>
            Guardar nota
          </button>
        )}
      </div>
    </div>
  )
}
