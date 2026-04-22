'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProductSuggestion } from '@/app/api/products/search/route'

export default function ProductSearch({ onPick }: { onPick: (p: ProductSuggestion) => void }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ProductSuggestion[]>([])
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
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`, { signal: abort.signal })
        if (!res.ok) { setItems([]); return }
        const data: ProductSuggestion[] = await res.json()
        setItems(Array.isArray(data) ? data : [])
        setOpen(true)
      } catch {
        // abort o red caída: ignoro
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

  function pick(p: ProductSuggestion) {
    onPick(p)
    setQ('')
    setItems([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        Buscar producto del catálogo Woo
      </label>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder="Nombre, SKU…"
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
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 360, overflowY: 'auto',
        }}>
          {items.map((p, i) => {
            const outOfStock = p.stock === 'outofstock'
            return (
              <button key={p.id} type="button" onClick={() => pick(p)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  borderBottom: i < items.length - 1 ? '0.5px solid #f5f1ec' : 'none',
                  display: 'flex', gap: 10, alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '0.5px solid #ede9e4', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#faf8f5', border: '0.5px solid #ede9e4', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a', whiteSpace: 'nowrap' }}>
                      ${p.price.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    {p.sku && <span>SKU {p.sku}</span>}
                    {outOfStock && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#a33', background: '#fbeaea', border: '0.5px solid #e0a8a8', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        Sin stock
                      </span>
                    )}
                    {p.stock === 'onbackorder' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        Backorder
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && items.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12, padding: 12,
          fontSize: 12, color: '#aaa',
        }}>
          Sin resultados en el catálogo. Cargá el item manualmente abajo.
        </div>
      )}
    </div>
  )
}
