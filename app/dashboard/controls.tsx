'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_LABELS, STATUS_ORDER, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS } from '@/lib/types'
import type { OrderStatus, TipoEnvio, ZonaReparto } from '@/lib/types'

type RepartidorLite = { id: string; name: string | null; email: string }

export default function DashboardControls({
  initialQ, initialStatus, initialScope, initialZona, initialTipo, initialRep, initialDate,
  zonas, repartidores,
}: {
  initialQ: string
  initialStatus: OrderStatus | undefined
  initialScope: 'today' | 'all'
  initialZona: string | undefined
  initialTipo: TipoEnvio | undefined
  initialRep: string | undefined
  initialDate: string
  zonas: Pick<ZonaReparto,'id'|'nombre'|'color'|'activa'>[]
  repartidores: RepartidorLite[]
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [status, setStatus] = useState<string>(initialStatus ?? '')
  const [scope, setScope] = useState<'today' | 'all'>(initialScope)
  const [zona, setZona] = useState<string>(initialZona ?? '')
  const [tipo, setTipo] = useState<string>(initialTipo ?? '')
  const [rep, setRep]   = useState<string>(initialRep ?? '')
  const [date, setDate] = useState<string>(initialDate ?? '')
  const [, startTransition] = useTransition()

  function apply(next: Partial<{
    q: string; status: string; scope: 'today'|'all';
    zona: string; tipo: string; rep: string; date: string;
  }>) {
    const params = new URLSearchParams()
    const nq   = next.q      !== undefined ? next.q      : q
    const ns   = next.status !== undefined ? next.status : status
    const nsc  = next.scope  ?? scope
    const nz   = next.zona   !== undefined ? next.zona   : zona
    const nt   = next.tipo   !== undefined ? next.tipo   : tipo
    const nr   = next.rep    !== undefined ? next.rep    : rep
    const nd   = next.date   !== undefined ? next.date   : date
    if (nq) params.set('q', nq)
    if (ns) params.set('status', ns)
    if (nsc && nsc !== 'today') params.set('scope', nsc)
    if (nz) params.set('zona', nz)
    if (nt) params.set('tipo', nt)
    if (nr) params.set('rep',  nr)
    if (nd) params.set('date', nd)
    startTransition(() => router.push(`/dashboard${params.toString() ? '?' + params.toString() : ''}`))
  }

  function selectTipo(t: string) { setTipo(t); apply({ tipo: t }) }

  const input: React.CSSProperties = {
    padding: '9px 12px', border: '1.5px solid #f0ede8', borderRadius: 10,
    fontSize: 13, background: '#fff', outline: 'none', color: '#2a2a2a',
  }

  const TIPO_TAB: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', border: '1.5px solid transparent', letterSpacing: '-0.2px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* TABS DE TIPO DE ENVÍO */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => selectTipo('')}
          style={{
            ...TIPO_TAB,
            background: tipo === '' ? '#2a2a2a' : '#fff',
            color:      tipo === '' ? '#fff'    : '#666',
            border:     tipo === '' ? '1.5px solid #2a2a2a' : '1.5px solid #f0ede8',
          }}>
          Todos
        </button>
        {(['express','programado','retiro'] as const).map(t => {
          const c = TIPO_ENVIO_COLORS[t]
          const active = tipo === t
          return (
            <button key={t} onClick={() => selectTipo(t)}
              style={{
                ...TIPO_TAB,
                background: active ? c.fg : c.bg,
                color:      active ? '#fff' : c.fg,
                border:     `1.5px solid ${c.border}`,
              }}>
              {TIPO_ENVIO_LABELS[t]}
            </button>
          )
        })}
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={e => { e.preventDefault(); apply({ q }) }} style={{ flex: '1 1 240px' }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar SA-2026-XXXX, nombre, DNI, tel…"
            style={{ ...input, width: '100%' }} />
        </form>

        <select value={status} onChange={e => { setStatus(e.target.value); apply({ status: e.target.value }) }} style={input}>
          <option value="">Todos los estados</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select value={zona} onChange={e => { setZona(e.target.value); apply({ zona: e.target.value }) }} style={input}>
          <option value="">Todas las zonas</option>
          <option value="sin_zona">Sin zona</option>
          {zonas.filter(z => z.activa).map(z => (
            <option key={z.id} value={z.id}>{z.nombre}</option>
          ))}
        </select>

        <select value={rep} onChange={e => { setRep(e.target.value); apply({ rep: e.target.value }) }} style={input}>
          <option value="">Todos los repartidores</option>
          <option value="sin_asignar">Sin asignar</option>
          {repartidores.map(r => (
            <option key={r.id} value={r.id}>{r.name || r.email}</option>
          ))}
        </select>

        <input type="date" value={date}
          onChange={e => { setDate(e.target.value); apply({ date: e.target.value, scope: 'today' }) }}
          style={input} />

        {!date && (
          <select value={scope} onChange={e => { const v = e.target.value as 'today'|'all'; setScope(v); apply({ scope: v }) }} style={input}>
            <option value="today">Solo hoy</option>
            <option value="all">Todos</option>
          </select>
        )}

        {date && (
          <button onClick={() => { setDate(''); apply({ date: '' }) }}
            style={{ ...input, cursor: 'pointer', background: '#faf8f5' }}>
            Limpiar fecha
          </button>
        )}
      </div>
    </div>
  )
}
