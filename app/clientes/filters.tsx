'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientesFilters({ initialQ }: { initialQ: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    startTransition(() => router.push(`/clientes${params.toString() ? '?' + params : ''}`))
  }

  return (
    <form onSubmit={submit}>
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar nombre, DNI, teléfono o email…"
        style={{
          padding: '9px 12px', border: '1.5px solid #f0ede8', borderRadius: 10,
          fontSize: 13, background: '#fff', outline: 'none', color: '#2a2a2a',
          minWidth: 260, fontFamily: 'inherit',
        }} />
    </form>
  )
}
