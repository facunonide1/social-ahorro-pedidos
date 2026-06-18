'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ALL = '__all__'

export default function ProveedoresFilters({
  initialQ,
  initialCategoria,
  initialActivo,
  categorias,
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
    if (nq.trim()) p.set('q', nq.trim())
    if (nc) p.set('categoria', nc)
    if (na) p.set('activo', na)
    startTransition(() =>
      router.push(`/admin/proveedores${p.toString() ? '?' + p : ''}`),
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          apply({ q })
        }}
        className="relative min-w-[240px] flex-1"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar razón social, nombre comercial o CUIT…"
          className="pl-9"
        />
      </form>

      <Select
        value={categoria || ALL}
        onValueChange={(v) => {
          const next = v === ALL ? '' : v
          setCategoria(next)
          apply({ categoria: next })
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Todas las categorías" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las categorías</SelectItem>
          {categorias.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activo || ALL}
        onValueChange={(v) => {
          const next = v === ALL ? '' : v
          setActivo(next)
          apply({ activo: next })
        }}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          <SelectItem value="1">Solo activos</SelectItem>
          <SelectItem value="0">Solo inactivos</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
