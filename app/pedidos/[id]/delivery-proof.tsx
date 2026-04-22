'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

export default function DeliveryProof({
  orderId, currentUrl, canEdit,
}: {
  orderId: string
  currentUrl: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(currentUrl)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/orders/${orderId}/delivery-proof`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      setUrl(json.url)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!url && !canEdit) return null

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>
        COMPROBANTE DE ENTREGA
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {url ? (
        <a href={url} target="_blank" rel="noreferrer"
          style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '0.5px solid #ede9e4' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Comprobante de entrega" style={{ width: '100%', height: 'auto', display: 'block' }} />
        </a>
      ) : (
        <div style={{ fontSize: 13, color: '#aaa' }}>Todavía no se subió la foto del comprobante.</div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={inputRef} type="file" accept="image/*" capture="environment"
            onChange={onPick} style={{ display: 'none' }} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ ...BTN, background: url ? '#f0ede8' : '#FF6D6E', color: url ? '#666' : '#fff', opacity: uploading ? 0.6 : 1, cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Subiendo…' : (url ? 'Reemplazar foto' : '📷 Subir foto de entrega')}
          </button>
        </div>
      )}
    </section>
  )
}
