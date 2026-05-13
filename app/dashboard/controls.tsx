'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

import { STATUS_LABELS, STATUS_ORDER, TIPO_ENVIO_LABELS } from '@/lib/types'
import type { OrderStatus, TipoEnvio, ZonaReparto } from '@/lib/types'

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

type RepartidorLite = { id: string; name: string | null; email: string }

const TIPOS: TipoEnvio[] = ['express', 'programado', 'retiro']

export default function DashboardControls({
  initialQ,
  initialStatus,
  initialScope,
  initialZona,
  initialTipo,
  initialRep,
  initialDate,
  zonas,
  repartidores,
}: {
  initialQ: string
  initialStatus: OrderStatus | undefined
  initialScope: 'today' | 'all'
  initialZona: string | undefined
  initialTipo: TipoEnvio | undefined
  initialRep: string | undefined
  initialDate: string
  zonas: Pick<ZonaReparto, 'id' | 'nombre' | 'color' | 'activa'>[]
  repartidores: RepartidorLite[]
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [status, setStatus] = useState<string>(initialStatus ?? '')
  const [scope, setScope] = useState<'today' | 'all'>(initialScope)
  const [zona, setZona] = useState<string>(initialZona ?? '')
  const [tipo, setTipo] = useState<string>(initialTipo ?? '')
  const [rep, setRep] = useState<string>(initialRep ?? '')
  const [date, setDate] = useState<string>(initialDate ?? '')
  const [, startTransition] = useTransition()

  function apply(
    next: Partial<{
      q: string
      status: string
      scope: 'today' | 'all'
      zona: string
      tipo: string
      rep: string
      date: string
    }>,
  ) {
    const params = new URLSearchParams()
    const nq = next.q !== undefined ? next.q : q
    const ns = next.status !== undefined ? next.status : status
    const nsc = next.scope ?? scope
    const nz = next.zona !== undefined ? next.zona : zona
    const nt = next.tipo !== undefined ? next.tipo : tipo
    const nr = next.rep !== undefined ? next.rep : rep
    const nd = next.date !== undefined ? next.date : date
    if (nq) params.set('q', nq)
    if (ns) params.set('status', ns)
    if (nsc && nsc !== 'today') params.set('scope', nsc)
    if (nz) params.set('zona', nz)
    if (nt) params.set('tipo', nt)
    if (nr) params.set('rep', nr)
    if (nd) params.set('date', nd)
    startTransition(() =>
      router.push(`/dashboard${params.toString() ? '?' + params.toString() : ''}`),
    )
  }

  function selectTipo(t: string) {
    setTipo(t)
    apply({ tipo: t })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs de tipo de envío */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant={tipo === '' ? 'default' : 'outline'}
          size="sm"
          onClick={() => selectTipo('')}
        >
          Todos
        </Button>
        {TIPOS.map((t) => (
          <Button
            key={t}
            type="button"
            variant={tipo === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => selectTipo(t)}
            className={cn(
              tipo === t && t === 'express' && 'bg-destructive hover:bg-destructive/90',
              tipo === t && t === 'programado' && 'bg-info hover:bg-info/90',
            )}
          >
            {TIPO_ENVIO_LABELS[t]}
          </Button>
        ))}
      </div>

      {/* Filtros */}
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
            placeholder="Buscar SA-2026-XXXX, nombre, DNI, tel…"
            className="pl-9"
          />
        </form>

        <Select
          value={status || 'all'}
          onValueChange={(v) => {
            const next = v === 'all' ? '' : v
            setStatus(next)
            apply({ status: next })
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={zona || 'all'}
          onValueChange={(v) => {
            const next = v === 'all' ? '' : v
            setZona(next)
            apply({ zona: next })
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todas las zonas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las zonas</SelectItem>
            <SelectItem value="sin_zona">Sin zona</SelectItem>
            {zonas
              .filter((z) => z.activa)
              .map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={rep || 'all'}
          onValueChange={(v) => {
            const next = v === 'all' ? '' : v
            setRep(next)
            apply({ rep: next })
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos los repartidores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los repartidores</SelectItem>
            <SelectItem value="sin_asignar">Sin asignar</SelectItem>
            {repartidores.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name || r.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            apply({ date: e.target.value, scope: 'today' })
          }}
          className="w-[150px]"
        />

        {!date && (
          <Select
            value={scope}
            onValueChange={(v) => {
              const next = v as 'today' | 'all'
              setScope(next)
              apply({ scope: next })
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Solo hoy</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        )}

        {date && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDate('')
              apply({ date: '' })
            }}
          >
            <X className="size-3.5" />
            Limpiar fecha
          </Button>
        )}
      </div>
    </div>
  )
}
