'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh', background: '#faf8f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        maxWidth: 520, width: '100%', background: '#fff',
        border: '0.5px solid #ede9e4', borderRadius: 18, padding: 24,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6D6E', letterSpacing: '0.4px', marginBottom: 8 }}>
          ERROR
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#2a2a2a', marginBottom: 10, letterSpacing: '-0.3px' }}>
          Algo salió mal
        </div>
        <div style={{
          fontSize: 13, color: '#666', background: '#faf8f5', border: '0.5px solid #f0ede8',
          borderRadius: 10, padding: 12, marginBottom: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {error?.message || 'Error desconocido'}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => reset()}
            style={{ padding: '10px 14px', border: 'none', borderRadius: 12, background: '#726DFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Reintentar
          </button>
          <a href="/login"
            style={{ padding: '10px 14px', border: '1.5px solid #f0ede8', borderRadius: 12, background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Ir al login
          </a>
        </div>
      </div>
    </div>
  )
}
