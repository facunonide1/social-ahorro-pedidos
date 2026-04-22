'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_LABELS, WHATSAPP_STATUS_LABELS } from '@/lib/types'
import type { WhatsappMessage, UserPedidos } from '@/lib/types'

const BTN: React.CSSProperties = {
  padding: '8px 12px', border: 'none', borderRadius: 10,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

export default function WhatsappMessagesList({
  messages, users, orderId,
}: {
  messages: WhatsappMessage[]
  users: Pick<UserPedidos,'id'|'name'|'email'>[]
  orderId: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(messages)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [regenMsg, setRegenMsg] = useState<string | null>(null)

  const userMap = new Map(users.map(u => [u.id, u.name || u.email]))

  async function regenerate() {
    setBusy('regenerate'); setErr(null); setRegenMsg(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/regenerate-messages`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.hint || json?.error || 'error')
        return
      }
      setRegenMsg(json.created > 0 ? `Se generaron ${json.created} mensajes a partir del historial.` : 'No había mensajes faltantes.')
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(null)
      setTimeout(() => setRegenMsg(null), 5000)
    }
  }

  async function patch(id: string, status: 'sent' | 'skipped' | 'pending') {
    setBusy(id); setErr(null)
    try {
      const res = await fetch(`/api/whatsapp-messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      if (json.message) setRows(arr => arr.map(r => r.id === id ? json.message : r))
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(null)
    }
  }

  function sendAndMark(m: WhatsappMessage) {
    const link = waLink(m.phone, m.message)
    if (!link) return
    // Abrimos wa.me en pestaña nueva
    window.open(link, '_blank', 'noopener,noreferrer')
    // Marcamos como enviado optimísticamente
    patch(m.id, 'sent')
  }

  if (rows.length === 0) {
    return (
      <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>
          MENSAJES DE WHATSAPP
        </div>
        {err && (
          <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
            {err}
          </div>
        )}
        {regenMsg && (
          <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>
            {regenMsg}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#888' }}>
          Todavía no hay mensajes para este pedido. Cada cambio de estado agrega uno automáticamente; si el pedido ya cambió antes, podés reconstruirlos desde el historial.
        </div>
        <div>
          <button onClick={regenerate} disabled={busy === 'regenerate'}
            style={{ ...BTN, background: '#726DFF', color: '#fff' }}>
            {busy === 'regenerate' ? 'Generando…' : 'Generar desde historial'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>
          MENSAJES DE WHATSAPP
        </div>
        <button onClick={regenerate} disabled={busy === 'regenerate'}
          title="Reconstruye los mensajes faltantes usando el historial del pedido."
          style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', padding: '6px 10px' }}>
          {busy === 'regenerate' ? '…' : 'Regenerar desde historial'}
        </button>
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}
      {regenMsg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>
          {regenMsg}
        </div>
      )}

      {rows.map(m => {
        const isPending = m.status === 'pending'
        const isSent    = m.status === 'sent'
        const isSkipped = m.status === 'skipped'
        const statusColor =
          isSent    ? { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' } :
          isSkipped ? { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' } :
                      { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' }
        const link = waLink(m.phone, m.message)
        return (
          <div key={m.id} style={{
            background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '0.5px solid #d9d6ff', padding: '2px 8px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  {STATUS_LABELS[m.status_trigger]}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: statusColor.fg, background: statusColor.bg,
                  border: `0.5px solid ${statusColor.border}`, padding: '2px 8px', borderRadius: 999,
                  letterSpacing: '0.3px', textTransform: 'uppercase',
                }}>
                  {WHATSAPP_STATUS_LABELS[m.status]}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#999' }}>
                {new Date(m.created_at).toLocaleString('es-AR')}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#2a2a2a', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {m.message}
            </div>

            <div style={{ fontSize: 11, color: '#999' }}>
              {m.phone ? `Para: ${m.phone}` : 'Sin teléfono válido'}
              {isSent && m.sent_at && (
                <> · Enviado {new Date(m.sent_at).toLocaleString('es-AR')}
                  {m.sent_by && userMap.has(m.sent_by) && ` por ${userMap.get(m.sent_by)}`}</>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isPending && link && (
                <button onClick={() => sendAndMark(m)} disabled={busy === m.id}
                  style={{ ...BTN, background: '#25D366', color: '#fff' }}>
                  {busy === m.id ? '…' : 'Enviar por WhatsApp'}
                </button>
              )}
              {isPending && !link && (
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  No se puede enviar: el cliente no tiene teléfono.
                </span>
              )}
              {isPending && (
                <button onClick={() => patch(m.id, 'skipped')} disabled={busy === m.id}
                  style={{ ...BTN, background: '#fff', color: '#888', border: '1.5px solid #f0ede8' }}>
                  Marcar como omitido
                </button>
              )}
              {(isSent || isSkipped) && (
                <button onClick={() => patch(m.id, 'pending')} disabled={busy === m.id}
                  style={{ ...BTN, background: '#fff', color: '#888', border: '1.5px solid #f0ede8' }}>
                  Marcar como pendiente
                </button>
              )}
              {link && !isPending && (
                <a href={link} target="_blank" rel="noreferrer"
                  style={{ ...BTN, background: '#fff', color: '#1f8a4c', border: '1.5px solid #8fd1a8', textDecoration: 'none' }}>
                  Abrir en WhatsApp
                </a>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
