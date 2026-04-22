'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/types'
import type { OrderStatus, ZonaReparto, UserRole } from '@/lib/types'

export default function DashboardControls({
  initialQ, initialStatus, initialScope, initialZona,
  zonas, role,
}: {
  initialQ: string
  initialStatus: OrderStatus | undefined
  initialScope: 'today' | 'all'
  initialZona: string | undefined
  zonas: Pick<ZonaReparto,'id'|'nombre'|'color'|'activa'>[]
  role: UserRole
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [status, setStatus] = useState<string>(initialStatus ?? '')
  const [scope, setScope] = useState<'today' | 'all'>(initialScope)
  const [zona, setZona] = useState<string>(initialZona ?? '')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function apply(next: Partial<{ q: string; status: string; scope: 'today'|'all'; zona: string }>) {
    const params = new URLSearchParams()
    const nq = next.q !== undefined ? next.q : q
    const ns = next.status !== undefined ? next.status : status
    const nsc = next.scope ?? scope
    const nz = next.zona !== undefined ? next.zona : zona
    if (nq) params.set('q', nq)
    if (ns) params.set('status', ns)
    if (nsc && nsc !== 'today') params.set('scope', nsc)
    if (nz) params.set('zona', nz)
    startTransition(() => router.push(`/dashboard${params.toString() ? '?' + params.toString() : ''}`))
  }

  async function runSync() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'error')
      setSyncMsg(`+${json.inserted} nuevos (${json.fetched} revisados)`)
      router.refresh()
    } catch (e: any) {
      setSyncMsg(`Error: ${e?.message || 'desconocido'}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' })
    router.push('/login')
  }

  const input: React.CSSProperties = {
    padding: '10px 12px', border: '1.5px solid #f0ede8', borderRadius: 12,
    fontSize: 13, background: '#faf8f5', outline: 'none', color: '#2a2a2a',
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <form onSubmit={e => { e.preventDefault(); apply({ q }) }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar nombre, DNI, tel, #pedido..."
          style={{ ...input, minWidth: 220 }} />
      </form>

      <select value={status} onChange={e => { setStatus(e.target.value); apply({ status: e.target.value }) }} style={input}>
        <option value="">Todos los estados</option>
        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>

      <select value={scope} onChange={e => { const v = e.target.value as 'today'|'all'; setScope(v); apply({ scope: v }) }} style={input}>
        <option value="today">Solo hoy</option>
        <option value="all">Todos</option>
      </select>

      <select value={zona} onChange={e => { setZona(e.target.value); apply({ zona: e.target.value }) }} style={input}>
        <option value="">Todas las zonas</option>
        <option value="sin_zona">Sin zona</option>
        {zonas.filter(z => z.activa).map(z => (
          <option key={z.id} value={z.id}>{z.nombre}</option>
        ))}
      </select>

      {role === 'admin' && (
        <Link href="/admin/configuracion"
          style={{ padding: '10px 14px', border: '1.5px solid #f0ede8', borderRadius: 12, background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          ⚙ Config
        </Link>
      )}

      <Link href="/pedidos/nuevo"
        style={{ padding: '10px 14px', border: 'none', borderRadius: 12, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
        + Nuevo pedido
      </Link>

      <button onClick={runSync} disabled={syncing}
        style={{ padding: '10px 14px', border: 'none', borderRadius: 12, background: '#726DFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
        {syncing ? 'Sincronizando...' : 'Sincronizar Woo'}
      </button>

      {syncMsg && <span style={{ fontSize: 12, color: '#666' }}>{syncMsg}</span>}

      <button onClick={logout}
        style={{ padding: '10px 14px', border: '1.5px solid #f0ede8', borderRadius: 12, background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Salir
      </button>
    </div>
  )
}
