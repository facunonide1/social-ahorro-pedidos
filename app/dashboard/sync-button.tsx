'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function runSync() {
    setSyncing(true); setMsg(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'error')
      setMsg(`+${json.inserted} nuevos (${json.fetched} revisados)`)
      router.refresh()
    } catch (e: any) {
      setMsg(`Error: ${e?.message || 'desconocido'}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {msg && <span style={{ fontSize: 12, color: '#666' }}>{msg}</span>}
      <button onClick={runSync} disabled={syncing}
        style={{
          padding: '9px 13px', border: 'none', borderRadius: 10,
          background: '#726DFF', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1,
        }}>
        {syncing ? 'Sincronizando…' : 'Sincronizar Woo'}
      </button>
    </div>
  )
}
