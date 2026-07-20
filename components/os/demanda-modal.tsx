'use client'

import { useEffect, useRef, useState } from 'react'
import { PackageX, Search, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Match = { id: string; nombre: string; sku: string | null; codigo_barras?: string | null }

/**
 * RADAR · "Me pidieron y no había". Modal de UN campo, fricción < 10s.
 * Escucha el evento global `nora:demanda` (disparado desde el "+"/⌘K).
 * Matchea catálogo → linkea producto_id; si no, guarda texto libre.
 */
export function DemandaModal() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)
  const debRef = useRef<any>(null)

  useEffect(() => {
    function abrir() { setQ(''); setMatches([]); setOpen(true) }
    window.addEventListener('nora:demanda', abrir)
    return () => window.removeEventListener('nora:demanda', abrir)
  }, [])

  useEffect(() => {
    const t = q.trim()
    if (debRef.current) clearTimeout(debRef.current)
    if (t.length < 2) { setMatches([]); return }
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`)
        const j = await r.json()
        setMatches((Array.isArray(j) ? j : []).slice(0, 6).map((p: any) => ({ id: p.id, nombre: p.nombre, sku: p.sku, codigo_barras: p.codigo_barras })))
      } catch { setMatches([]) }
    }, 200)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [q])

  async function guardar(texto: string, producto_id: string | null) {
    const t = texto.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/compras/demanda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'registrar', texto: t, producto_id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Anotado', { description: producto_id ? 'Linkeado al producto — quedó en el Radar.' : 'Lo registré como no lo trabajamos.' })
      setOpen(false)
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo anotar.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageX className="size-5 text-primary" /> Me pidieron y no había</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(q, null) }}
              placeholder="¿Qué te pidieron?" className="h-11 pl-9 text-base" disabled={busy} />
          </div>
          {matches.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              {matches.map((m) => (
                <button key={m.id} type="button" disabled={busy} onClick={() => guardar(m.nombre, m.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50">
                  <span className="min-w-0 truncate">{m.nombre}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{m.sku}</span>
                </button>
              ))}
            </div>
          )}
          <Button className="w-full" size="lg" disabled={busy || !q.trim()} onClick={() => guardar(q, null)}>
            <Check className="size-4" /> {busy ? 'Anotando…' : 'Anotar (no lo trabajamos)'}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Tocá un producto de la lista si existe; si no, anotá el texto libre.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
