'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'

import type { CustomerSuggestion } from '@/app/api/customers/search/route'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export default function CustomerSearch({
  onPick,
}: {
  onPick: (c: CustomerSuggestion) => void
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<CustomerSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const abort = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, {
          signal: abort.signal,
        })
        if (!res.ok) {
          setItems([])
          return
        }
        const data: CustomerSuggestion[] = await res.json()
        setItems(Array.isArray(data) ? data : [])
        setOpen(true)
      } catch {
        /* abort/red */
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(handle)
      abort.abort()
    }
  }, [q])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(c: CustomerSuggestion) {
    onPick(c)
    setQ('')
    setItems([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Buscar cliente existente
      </Label>
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="Escribí nombre, DNI, teléfono o email…"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {items.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{c.name || '(sin nombre)'}</span>
                <Badge
                  variant={c.source === 'woo' ? 'info' : 'success'}
                  className="text-[10px] uppercase tracking-wide"
                >
                  {c.source === 'woo' ? 'WOO' : 'LOCAL'}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {[c.dni ? `DNI ${c.dni}` : null, c.phone ?? null, c.email ?? null]
                  .filter(Boolean)
                  .join(' · ') || 'sin datos de contacto'}
              </div>
              {c.address?.address_1 && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  <MapPin className="size-3" />
                  {[c.address.address_1, c.address.city].filter(Boolean).join(', ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && items.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-md border border-border bg-popover p-3 text-xs text-muted-foreground">
          Sin coincidencias. Cargá los datos manualmente abajo.
        </div>
      )}
    </div>
  )
}
