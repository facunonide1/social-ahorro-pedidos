'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Match = { id: string; nombre: string; sku: string | null }

/**
 * OS-5b · Registro de despacho controlado, UN TAP (fricción < 10s). Escucha el
 * evento global `nora:despacho`. CP-01: solo producto + turno + quién/cuándo.
 */
export function DespachoModal() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)
  const debRef = useRef<any>(null)

  useEffect(() => {
    function abrir() { setQ(''); setMatches([]); setOpen(true) }
    window.addEventListener('nora:despacho', abrir)
    return () => window.removeEventListener('nora:despacho', abrir)
  }, [])

  useEffect(() => {
    const t = q.trim()
    if (debRef.current) clearTimeout(debRef.current)
    if (t.length < 2) { setMatches([]); return }
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`)
        const j = await r.json()
        setMatches((Array.isArray(j) ? j : []).slice(0, 7).map((p: any) => ({ id: p.id, nombre: p.nombre, sku: p.sku })))
      } catch { setMatches([]) }
    }, 200)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [q])

  async function registrar(producto_id: string) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'registrar_despacho', producto_id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Despacho registrado', { description: `Turno ${j.turno}. Recordá: la receta va al libro recetario.` })
      setOpen(false)
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo registrar.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Despacho de controlado</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Qué despachaste? (nombre o SKU)" className="h-11 pl-9 text-base" disabled={busy} />
          </div>
          {matches.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              {matches.map((m) => (
                <button key={m.id} type="button" disabled={busy} onClick={() => registrar(m.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50">
                  <span className="min-w-0 truncate">{m.nombre}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{m.sku}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-center text-[11px] text-muted-foreground">Registro interno de control (quién/cuándo/SKU/turno). El libro recetario rubricado es el registro legal.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
