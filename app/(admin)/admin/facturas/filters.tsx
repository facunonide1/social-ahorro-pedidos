'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const ALL = '__all__'

const QUICK_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'hoy', label: 'Vencen hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'vencidas', label: 'Vencidas' },
]

export default function FacturasFilters({
  initialQ,
  initialEstado,
  initialProveedor,
  initialVence,
  estados,
  proveedores,
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

  function apply(
    next: Partial<{ q: string; estado: string; proveedor: string; vence: string }>,
  ) {
    const p = new URLSearchParams()
    const nq = next.q !== undefined ? next.q : q
    const ne = next.estado !== undefined ? next.estado : estado
    const np = next.proveedor !== undefined ? next.proveedor : proveedor
    const nv = next.vence !== undefined ? next.vence : vence
    if (nq.trim()) p.set('q', nq.trim())
    if (ne) p.set('estado', ne)
    if (np) p.set('proveedor', np)
    if (nv) p.set('vence', nv)
    startTransition(() =>
      router.push(`/admin/facturas${p.toString() ? '?' + p : ''}`),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={vence === value ? 'default' : 'outline'}
            className={cn('rounded-full')}
            onClick={() => {
              setVence(value)
              apply({ vence: value })
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            apply({ q })
          }}
          className="relative min-w-[220px] flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar punto de venta o número…"
            className="pl-9"
          />
        </form>
        <Select
          value={estado || ALL}
          onValueChange={(v) => {
            const next = v === ALL ? '' : v
            setEstado(next)
            apply({ estado: next })
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {estados.map((s) => (
              <SelectItem key={s} value={s}>
                {FACTURA_ESTADO_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={proveedor || ALL}
          onValueChange={(v) => {
            const next = v === ALL ? '' : v
            setProveedor(next)
            apply({ proveedor: next })
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos los proveedores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los proveedores</SelectItem>
            {proveedores.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.razon_social}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
