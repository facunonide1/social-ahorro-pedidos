'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Download, AlertTriangle, ArrowRightLeft, X, Check, ShoppingCart, Search } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RUBROS } from '@/components/compras/rubro-filter'
import { cn } from '@/lib/utils'

export type ProductoLite = { id: string; sku: string | null; nombre: string }
export type SucLite = { id: string; nombre: string }
export type FaltanteGrupo = {
  key: string; producto_id: string | null; nombre: string; sku: string | null; rubro: string | null
  total: number; stockEnOtras: number
  sucursales: string[]
  avisos: { id: string; sucursal: string; cantidad: number | null; fecha: string; estado: string }[]
}

export function FaltantesClient({ grupos, rol, sucursalId, productos, sucursales }: { grupos: FaltanteGrupo[]; rol: string; sucursalId: string | null; productos: ProductoLite[]; sucursales: SucLite[] }) {
  const router = useRouter()
  const gestiona = ['super_admin', 'gerente', 'comprador'].includes(rol)
  const [nuevo, setNuevo] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set()) // grupo keys seleccionados

  function toggle(k: string) { setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n }) }

  async function accion(action: 'descartar' | 'resolver', grupoKeys: string[]) {
    const ids = grupos.filter((g) => grupoKeys.includes(g.key)).flatMap((g) => g.avisos.map((a) => a.id))
    if (!ids.length) return
    try {
      const r = await fetch('/api/compras/faltantes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ids }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(action === 'resolver' ? 'Marcados resueltos.' : 'Descartados.'); setSel(new Set()); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  function agregarAOrden(keys: string[]) {
    const avisoIds = grupos.filter((g) => keys.includes(g.key)).flatMap((g) => g.avisos.map((a) => a.id))
    if (!avisoIds.length) { toast.error('Seleccioná al menos un faltante.'); return }
    router.push(`/admin/compras/ordenes/nueva?avisos=${avisoIds.join(',')}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">{grupos.length} productos con faltante · {grupos.reduce((a, g) => a + g.avisos.length, 0)} avisos</div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportExcel('faltantes', grupos.map((g) => ({ SKU: g.sku ?? '', Producto: g.nombre, Avisos: g.avisos.length, Sucursales: g.sucursales.join(', '), 'Cant. sugerida': g.total, 'Stock en otras': g.stockEnOtras })))}><Download className="size-4" /> Excel</Button>
          <Button size="sm" onClick={() => setNuevo(true)}><Plus className="size-4" /> Falta esto</Button>
        </div>
      </div>

      {gestiona && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-nora-bg p-2 text-sm">
          <span className="font-medium">{sel.size} seleccionados</span>
          <Button size="sm" onClick={() => agregarAOrden([...sel])}><ShoppingCart className="size-4" /> Agregar a orden</Button>
          <Button size="sm" variant="outline" onClick={() => accion('resolver', [...sel])}><Check className="size-4" /> Resolver</Button>
          <Button size="sm" variant="ghost" onClick={() => accion('descartar', [...sel])}><X className="size-4" /> Descartar</Button>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <AlertTriangle className="size-7 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin faltantes pendientes.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
              {gestiona && <th className="w-8 px-2 py-2" />}
              <th className="px-3 py-2">Producto</th><th className="px-3 py-2">Sucursales que reportan</th><th className="px-3 py-2 text-right">Avisos</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2">NORA</th>{gestiona && <th className="px-3 py-2" />}
            </tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.key} className="border-t border-border align-top">
                  {gestiona && <td className="px-2 py-2"><input type="checkbox" checked={sel.has(g.key)} onChange={() => toggle(g.key)} className="size-4 accent-[hsl(var(--primary))]" /></td>}
                  <td className="px-3 py-2"><div className="font-medium">{g.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{g.sku ?? (g.producto_id ? '' : 'texto libre')}</div></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{g.sucursales.join(', ')}</td>
                  <td className="px-3 py-2 text-right"><Badge variant={g.avisos.length > 1 ? 'warning' : 'outline'}>{g.avisos.length}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.total || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {g.stockEnOtras > 0
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowRightLeft className="size-3" /> {g.stockEnOtras} en otra sucursal → transferir</span>
                      : <span className="text-muted-foreground">comprar</span>}
                  </td>
                  {gestiona && <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => agregarAOrden([g.key])}>A orden</Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && <NuevoAviso productos={productos} sucursales={sucursales} sucursalId={sucursalId} onClose={() => setNuevo(false)} />}
    </div>
  )
}

function NuevoAviso({ productos, sucursales, sucursalId, onClose }: { productos: ProductoLite[]; sucursales: SucLite[]; sucursalId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [prod, setProd] = useState<ProductoLite | null>(null)
  const [libre, setLibre] = useState('')
  const [suc, setSuc] = useState(sucursalId ?? '')
  const [rubro, setRubro] = useState('farmacia')
  const [cant, setCant] = useState('')
  const [busy, setBusy] = useState(false)

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return []
    return productos.filter((p) => `${p.nombre} ${p.sku ?? ''}`.toLowerCase().includes(t)).slice(0, 8)
  }, [q, productos])

  async function submit() {
    if (!prod && !libre.trim()) { toast.error('Elegí un producto o describí el faltante.'); return }
    if (!suc) { toast.error('Elegí la sucursal.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/compras/faltantes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ producto_id: prod?.id ?? null, texto_libre: prod ? null : libre.trim(), sucursal_id: suc, rubro, cantidad_sugerida: cant ? Number(cant) : null }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Faltante reportado a Compras.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Reportar faltante</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Producto del catálogo</Label>
            {prod ? (
              <div className="flex items-center justify-between rounded-md border border-primary/40 bg-nora-bg px-3 py-2 text-sm">
                <span>{prod.nombre} <span className="font-mono text-[10px] text-muted-foreground">{prod.sku}</span></span>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setProd(null)}>cambiar</Button>
              </div>
            ) : (
              <>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU…" className="pl-8" /></div>
                {matches.length > 0 && (
                  <div className="rounded-md border border-border">
                    {matches.map((m) => <button key={m.id} type="button" onClick={() => { setProd(m); setQ('') }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"><span>{m.nombre}</span><span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}
                  </div>
                )}
              </>
            )}
          </div>

          {!prod && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">…o describilo (si no está en catálogo)</Label>
              <Input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Ej. Shampoo X 400ml" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
              <Select value={suc} onValueChange={setSuc}><SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rubro</Label>
              <Select value={rubro} onValueChange={setRubro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RUBROS.filter((r) => r.v !== 'todos').map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cantidad sugerida (opcional)</Label><Input type="number" value={cant} onChange={(e) => setCant(e.target.value)} /></div>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">{busy ? 'Enviando…' : 'Enviar a Compras'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
