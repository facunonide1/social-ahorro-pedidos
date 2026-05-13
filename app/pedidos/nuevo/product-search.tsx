'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import type { ProductSuggestion } from '@/app/api/products/search/route'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ProductSearch({
  onPick,
}: {
  onPick: (p: ProductSuggestion) => void
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ProductSuggestion[]>([])
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
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`, {
          signal: abort.signal,
        })
        if (!res.ok) {
          setItems([])
          return
        }
        const data: ProductSuggestion[] = await res.json()
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

  function pick(p: ProductSuggestion) {
    onPick(p)
    setQ('')
    setItems([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Buscar producto del catálogo Woo
      </Label>
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="Nombre, SKU…"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[360px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {items.map((p) => {
            const outOfStock = p.stock === 'outofstock'
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
              >
                {p.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.image}
                    alt=""
                    className="size-9 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="size-9 shrink-0 rounded-md border border-border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums">
                      ${p.price.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {p.sku && <span>SKU {p.sku}</span>}
                    {outOfStock && (
                      <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                        Sin stock
                      </Badge>
                    )}
                    {p.stock === 'onbackorder' && (
                      <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                        Backorder
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && items.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-md border border-border bg-popover p-3 text-xs text-muted-foreground">
          Sin resultados en el catálogo. Cargá el item manualmente abajo.
        </div>
      )}
    </div>
  )
}
