'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type RubroRow = { rubro: string; dias_ventana: number | string; condicion: string | null }

/**
 * Ventana de devolución del proveedor (OS-3 · A): días default + filas por rubro.
 * fecha límite de devolución = vencimiento − dias_ventana. Carga manual.
 */
export function DevolucionesSection({
  proveedorId,
  diasDefault,
  rubrosInicial,
  readOnly,
}: {
  proveedorId: string
  diasDefault: number | null
  rubrosInicial: RubroRow[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [dias, setDias] = useState<string>(diasDefault == null ? '' : String(diasDefault))
  const [rubros, setRubros] = useState<RubroRow[]>(rubrosInicial)
  const [busy, setBusy] = useState(false)

  function updRubro(i: number, patch: Partial<RubroRow>) { setRubros((r) => r.map((x, j) => j === i ? { ...x, ...patch } : x)) }

  async function guardar() {
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/proveedor-devolucion', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proveedor_id: proveedorId, dias_default: dias, rubros }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Ventana de devolución guardada.'); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Undo2 className="size-3.5" /> Ventana de devolución
      </h2>
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground">Hasta cuántos días <b>antes del vencimiento</b> esta droguería acepta devoluciones. Pasada esa fecha solo queda liquidar.</p>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Días default</Label><Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} placeholder="ej. 30" className="w-32" disabled={readOnly} /></div>
          <span className="pb-2 text-xs text-muted-foreground">días antes de vencer</span>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Por rubro (opcional, pisa el default)</Label>
          {rubros.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.rubro} onChange={(e) => updRubro(i, { rubro: e.target.value })} placeholder="farmacia / perfumería / super" className="h-8 flex-1" disabled={readOnly} />
              <Input type="number" min={0} value={r.dias_ventana} onChange={(e) => updRubro(i, { dias_ventana: e.target.value })} placeholder="días" className="h-8 w-24" disabled={readOnly} />
              <Input value={r.condicion ?? ''} onChange={(e) => updRubro(i, { condicion: e.target.value })} placeholder="condición" className="h-8 flex-1" disabled={readOnly} />
              {!readOnly && <button onClick={() => setRubros((x) => x.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-rose-600"><Trash2 className="size-4" /></button>}
            </div>
          ))}
          {!readOnly && <Button size="sm" variant="outline" onClick={() => setRubros((x) => [...x, { rubro: '', dias_ventana: '', condicion: '' }])}><Plus className="size-3.5" /> Agregar rubro</Button>}
        </div>

        {!readOnly && <Button disabled={busy} onClick={guardar}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar ventana</Button>}
      </div>
    </section>
  )
}
