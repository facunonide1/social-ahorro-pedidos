'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const INPUT: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid #f0ede8', borderRadius: 10,
  fontSize: 13, background: '#fff', outline: 'none', color: '#2a2a2a',
}

export default function Filters({
  initialQ, initialCategoria, initialActivo, categorias,
}: {
  initialQ: string
  initialCategoria: string
  initialActivo: string
  categorias: string[]
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [categoria, setCategoria] = useState(initialCategoria)
  const [activo, setActivo] = useState(initialActivo)
  const [, startTransition] = useTransition()

  function apply(next: Partial<{ q: string; categoria: string; activo: string }>) {
    const p = new URLSearchParams()
    const nq = next.q !== undefined ? next.q : q
    const nc = next.categoria !== undefined ? next.categoria : categoria
    const na = next.activo !== undefined ? next.activo : activo
    if (nq) p.set('q', nq)
    if (nc) p.set('categoria', nc)
    if (na) p.set('activo', na)
    startTransition(() => router.push(`/hub/proveedores${p.toString() ? '?' + p : ''}`))
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <form onSubmit={e => { e.preventDefault(); apply({ q }) }} style={{ flex: '1 1 260px' }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar razón social, nombre comercial o CUIT…"
          style={{ ...INPUT, width: '100%' }} />
      </form>

      <select value={categoria} onChange={e => { setCategoria(e.target.value); apply({ categoria: e.target.value }) }} style={INPUT}>
        <option value="">Todas las categorías</option>
        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select value={activo} onChange={e => { setActivo(e.target.value); apply({ activo: e.target.value }) }} style={INPUT}>
        <option value="">Todos</option>
        <option value="1">Solo activos</option>
        <option value="0">Solo inactivos</option>
      </select>
    </div>
  )
}
