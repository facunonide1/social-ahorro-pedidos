'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import type { SearchResult } from '@/app/api/search/route'

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [data, setData] = useState<SearchResult>({ orders: [], customers: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      setQ('')
      setData({ orders: [], customers: [] })
    }
  }, [open])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setData({ orders: [], customers: [] })
      return
    }
    setLoading(true)
    const abort = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: abort.signal,
        })
        if (!res.ok) return
        const json: SearchResult = await res.json()
        setData(json)
      } catch {
        /* abort/red */
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      clearTimeout(handle)
      abort.abort()
    }
  }, [q])

  function goto(url: string) {
    setOpen(false)
    router.push(url)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Search className="size-3.5" />
        <span className="hidden md:inline">Buscar</span>
        <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Buscar pedidos o clientes (código, nombre, DNI, teléfono…)"
        />
        <CommandList>
          {q.trim().length < 2 && !loading && (
            <CommandEmpty>Escribí al menos 2 caracteres.</CommandEmpty>
          )}
          {q.trim().length >= 2 &&
            !loading &&
            data.orders.length === 0 &&
            data.customers.length === 0 && (
              <CommandEmpty>Sin resultados para &ldquo;{q}&rdquo;.</CommandEmpty>
            )}
          {loading && <CommandEmpty>Buscando…</CommandEmpty>}

          {data.orders.length > 0 && (
            <CommandGroup heading="Pedidos">
              {data.orders.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.codigo} ${o.customer_name ?? ''}`}
                  onSelect={() => goto(`/pedidos/${o.id}`)}
                  className="flex items-center gap-3"
                >
                  <span className="min-w-[110px] font-bold tabular-nums">{o.codigo}</span>
                  <span className="flex-1 truncate">{o.customer_name || '—'}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="font-semibold tabular-nums">
                    ${Number(o.total).toLocaleString('es-AR')}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data.orders.length > 0 && data.customers.length > 0 && <CommandSeparator />}

          {data.customers.length > 0 && (
            <CommandGroup heading="Clientes">
              {data.customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name ?? ''} ${c.dni ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`}
                  onSelect={() => goto(`/clientes/${c.id}`)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{c.name || '(sin nombre)'}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.dni ? `DNI ${c.dni}` : null, c.phone, c.email]
                      .filter(Boolean)
                      .join(' · ') || 'sin contacto'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
