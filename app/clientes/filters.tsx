'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

export default function ClientesFilters({ initialQ }: { initialQ: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    startTransition(() =>
      router.push(`/clientes${params.toString() ? '?' + params : ''}`),
    )
  }

  return (
    <form onSubmit={submit} className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar nombre, DNI, teléfono o email…"
        className="pl-9"
      />
    </form>
  )
}
