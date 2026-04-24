'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'

const INPUT: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid #f0ede8', borderRadius: 10,
  fontSize: 13, background: '#fff', outline: 'none', color: '#2a2a2a',
}

export default function FacturasFilters({
  initialQ, initialEstado, initialProveedor, initialVence,
  estados, proveedores,
}: {
  initialQ: string
  initialEstado: string
  initialProveedor: string
  initialVence: string
  estados: FacturaEstado[]
  proveedores: { id: string; razon_social: string }[]
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [estado, setEstado] = useState(initialEstado)
  const [proveedor, setProveedor] = useState(initialProveedor)
  const [vence, setVence] = useState(initialVence)
  const [, startTransition] = useTransition()

  function apply(next: Partial<{ q: string; estado: string; proveedor: string; vence: string }>) {
    const p = new URLSearchParams()
    const nq = next.q !== undefined ? next.q : q
    const ne = next.estado !== undefined ? next.estado : estado
    const np = next.proveedor !== undefined ? next.proveedor : proveedor
    const nv = next.vence !== undefined ? next.vence : vence
    if (nq) p.set('q', nq)
    if (ne) p.set('estado', ne)
    if (np) p.set('proveedor', np)
    if (nv) p.set('vence', nv)
    startTransition(() => router.push(`/hub/facturas${p.toString() ? '?' + p : ''}`))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['','Todas'], ['hoy','Vencen hoy'], ['semana','Esta semana'], ['vencidas','Vencidas']].map(([v, label]) => {
          const active = vence === v
          return (
            <button key={v} onClick={() => { setVence(v); apply({ vence: v }) }}
              style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: '1.5px solid',
                background: active ? '#FF6D6E' : '#fff',
                color: active ? '#fff' : '#666',
                borderColor: active ? '#FF6D6E' : '#f0ede8',
              }}>
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={e => { e.preventDefault(); apply({ q }) }} style={{ flex: '1 1 220px' }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar punto de venta o número…"
            style={{ ...INPUT, width: '100%' }} />
        </form>
        <select value={estado} onChange={e => { setEstado(e.target.value); apply({ estado: e.target.value }) }} style={INPUT}>
          <option value="">Todos los estados</option>
          {estados.map(s => <option key={s} value={s}>{FACTURA_ESTADO_LABELS[s]}</option>)}
        </select>
        <select value={proveedor} onChange={e => { setProveedor(e.target.value); apply({ proveedor: e.target.value }) }} style={INPUT}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
        </select>
      </div>
    </div>
  )
}
