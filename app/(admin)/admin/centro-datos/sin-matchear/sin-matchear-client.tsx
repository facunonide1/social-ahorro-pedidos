'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackagePlus, Link2, EyeOff, Loader2, Search, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export type SinMatchRow = {
  id: string; sku: string | null; codigo: string | null; barras: string | null
  descripcion: string | null; datos: Record<string, unknown>; created_at: string
}
type Prod = { id: string; sku: string | null; nombre: string; codigo_barras: string | null }

export function SinMatchearClient({ rows }: { rows: SinMatchRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [vincular, setVincular] = useState<SinMatchRow | null>(null)

  async function accion(body: any, msg: string) {
    setBusy(body.id)
    try {
      const r = await fetch('/api/centro-datos/sin-match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(msg); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null); setVincular(null) }
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <CheckCircle2 className="size-8 text-emerald-500" />
        <div className="text-sm font-medium">Cola vacía</div>
        <div className="text-sm text-muted-foreground">Todos los productos importados matchearon con el catálogo.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertCircle className="size-4 text-amber-500" /> {rows.length} items pendientes de resolución</div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">CODIGO</th><th className="px-3 py-2">BARRAS</th><th className="px-3 py-2">Descripción origen</th><th className="px-3 py-2">Detectado</th><th className="px-3 py-2 text-right">Acciones</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2 font-mono text-xs">{r.sku ?? r.codigo ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.barras ?? '—'}</td>
                <td className="px-3 py-2 max-w-[280px] truncate">{r.descripcion ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('es-AR')}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => accion({ accion: 'crear', id: r.id }, 'Producto creado y vinculado')}>
                      {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <PackagePlus className="size-3.5" />} Crear
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setVincular(r)}><Link2 className="size-3.5" /> Vincular</Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy === r.id} onClick={() => accion({ accion: 'ignorar', id: r.id }, 'Item ignorado')}><EyeOff className="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vincular && <VincularDialog item={vincular} onClose={() => setVincular(null)} onConfirm={(pid) => accion({ accion: 'vincular', id: vincular.id, producto_id: pid }, 'Vinculado al producto')} />}
    </div>
  )
}

function VincularDialog({ item, onClose, onConfirm }: { item: SinMatchRow; onClose: () => void; onConfirm: (pid: string) => void }) {
  const [q, setQ] = useState(item.descripcion ?? item.sku ?? '')
  const [res, setRes] = useState<Prod[]>([])
  const [buscando, setBuscando] = useState(false)

  async function buscar() {
    if (q.trim().length < 2) return
    setBuscando(true)
    try {
      const r = await fetch(`/api/centro-datos/sin-match?q=${encodeURIComponent(q)}`)
      const j = await r.json(); setRes(j.productos ?? [])
    } finally { setBuscando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-medium">Vincular a producto existente</div>
        <div className="mt-1 text-xs text-muted-foreground">{item.descripcion ?? item.sku}</div>
        <div className="mt-3 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Buscar por SKU o nombre…" />
          <Button variant="outline" disabled={buscando} onClick={buscar}>{buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button>
        </div>
        <div className="mt-3 max-h-64 space-y-1 overflow-auto">
          {res.map((p) => (
            <button key={p.id} onClick={() => onConfirm(p.id)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-muted/30">
              <div className="min-w-0"><div className="truncate">{p.nombre}</div><div className="font-mono text-xs text-muted-foreground">{p.sku ?? '—'}</div></div>
              <Badge variant="outline" className="text-[10px]">vincular</Badge>
            </button>
          ))}
          {!res.length && !buscando && <div className="py-4 text-center text-xs text-muted-foreground">Buscá un producto para vincular.</div>}
        </div>
        <div className="mt-3 flex justify-end"><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button></div>
      </div>
    </div>
  )
}
