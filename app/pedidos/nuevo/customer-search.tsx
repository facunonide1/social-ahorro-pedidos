'use client'

import { useEffect, useRef, useState } from 'react'
import type { CustomerSuggestion } from '@/app/api/customers/search/route'

export default function CustomerSearch({ onPick }: { onPick: (c: CustomerSuggestion) => void }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<CustomerSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setItems([]); setLoading(false); return }
    setLoading(true)
    const abort = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, { signal: abort.signal })
        if (!res.ok) { setItems([]); return }
        const data: CustomerSuggestion[] = await res.json()
        setItems(Array.isArray(data) ? data : [])
        setOpen(true)
      } catch {
        // ignoro abortos y errores de red, no spameo al user
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(handle); abort.abort() }
  }, [q])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(c: CustomerSuggestion) {
    onPick(c)
    setQ('')
    setItems([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        Buscar cliente existente
      </label>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder="Escribí nombre, teléfono o email…"
        style={{
          width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
          borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
      {loading && (
        <div style={{ position: 'absolute', right: 12, top: 36, fontSize: 11, color: '#999' }}>
          buscando…
        </div>
      )}

      {open && items.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 320, overflowY: 'auto',
        }}>
          {items.map((c, i) => (
            <button key={i} type="button" onClick={() => pick(c)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none',
                background: 'transparent', cursor: 'pointer', borderBottom: i < items.length - 1 ? '0.5px solid #f5f1ec' : 'none',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2a2a' }}>{c.name || '(sin nombre)'}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.3px', padding: '2px 8px', borderRadius: 999,
                  background: c.source === 'woo' ? '#eeedff' : '#eaf7ef',
                  color:     c.source === 'woo' ? '#726DFF' : '#1f8a4c',
                }}>
                  {c.source === 'woo' ? 'WOO' : 'LOCAL'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {[c.phone, c.email].filter(Boolean).join(' · ') || 'sin teléfono ni email'}
              </div>
              {c.address?.address_1 && (
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  📍 {[c.address.address_1, c.address.city].filter(Boolean).join(', ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && items.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12, padding: 12,
          fontSize: 12, color: '#aaa',
        }}>
          Sin coincidencias. Cargá los datos manualmente abajo.
        </div>
      )}
    </div>
  )
}
