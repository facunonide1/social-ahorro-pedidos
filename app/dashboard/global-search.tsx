'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_LABELS, STATUS_COLORS, TIPO_ENVIO_LABELS } from '@/lib/types'
import type { SearchResult } from '@/app/api/search/route'

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [q, setQ]         = useState('')
  const [data, setData]   = useState<SearchResult>({ orders: [], customers: [] })
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K abre, Esc cierra
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else { setQ(''); setData({ orders: [], customers: [] }) }
  }, [open])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setData({ orders: [], customers: [] }); return }
    setLoading(true)
    const abort = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: abort.signal })
        if (!res.ok) return
        const json: SearchResult = await res.json()
        setData(json)
      } catch {
        // abort/red, ignoro
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => { clearTimeout(handle); abort.abort() }
  }, [q])

  function goto(url: string) {
    setOpen(false)
    router.push(url)
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        title="Búsqueda global (Ctrl/Cmd+K)"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: '#fff', color: '#888', border: '1.5px solid #f0ede8',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <span>🔍</span>
        <span className="sa-desktop-only">Buscar</span>
        <span className="sa-desktop-only" style={{ fontSize: 10, color: '#aaa', background: '#faf8f5', border: '0.5px solid #ede9e4', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.3px' }}>⌘K</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: '10vh', left: '50%', transform: 'translateX(-50%)',
            width: 'min(92vw, 600px)', maxHeight: '80vh',
            background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #ede9e4', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔍</span>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar pedidos o clientes (código, nombre, DNI, teléfono…)"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', color: '#2a2a2a', background: 'transparent' }} />
              {loading && <span style={{ fontSize: 11, color: '#aaa' }}>…</span>}
              <span onClick={() => setOpen(false)}
                style={{ fontSize: 10, color: '#aaa', background: '#faf8f5', border: '0.5px solid #ede9e4', padding: '3px 6px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.3px' }}>
                ESC
              </span>
            </div>

            <div style={{ overflowY: 'auto', padding: 8 }}>
              {q.trim().length < 2 && (
                <div style={{ fontSize: 13, color: '#aaa', padding: 20, textAlign: 'center' }}>
                  Escribí al menos 2 caracteres para buscar.
                </div>
              )}

              {q.trim().length >= 2 && !loading && data.orders.length === 0 && data.customers.length === 0 && (
                <div style={{ fontSize: 13, color: '#aaa', padding: 20, textAlign: 'center' }}>
                  Sin resultados para "{q}".
                </div>
              )}

              {data.orders.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.4px', padding: '6px 10px', textTransform: 'uppercase' }}>Pedidos</div>
                  {data.orders.map(o => {
                    const sc = STATUS_COLORS[o.status]
                    return (
                      <button key={o.id} onClick={() => goto(`/pedidos/${o.id}`)}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                          padding: '8px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140 }}>{o.codigo}</span>
                        <span style={{ fontSize: 13, color: '#2a2a2a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.customer_name || '—'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, border: `0.5px solid ${sc.border}`, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px' }}>
                          {STATUS_LABELS[o.status]}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>
                          ${Number(o.total).toLocaleString('es-AR')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {data.customers.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.4px', padding: '6px 10px', textTransform: 'uppercase' }}>Clientes</div>
                  {data.customers.map(c => (
                    <button key={c.id} onClick={() => goto(`/clientes/${c.id}`)}
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                        padding: '8px 10px', borderRadius: 8, display: 'flex', flexDirection: 'column' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2a2a' }}>{c.name || '(sin nombre)'}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>
                        {[c.dni ? `DNI ${c.dni}` : null, c.phone, c.email].filter(Boolean).join(' · ') || 'sin contacto'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
