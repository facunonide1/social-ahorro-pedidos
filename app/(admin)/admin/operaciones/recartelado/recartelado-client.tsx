'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ListChecks, Check, Loader2, Tag } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type RecItem = { id: string; nombre: string; sku: string | null; precio_viejo: number; precio_nuevo: number; estado: string }
export type ListaRecartelado = { id: string; sucursal_id: string; sucursal: string; fecha: string; estado: string; tarea_id: string | null; items: RecItem[] }

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export function RecarteladoClient({ listas }: { listas: ListaRecartelado[] }) {
  if (listas.length === 0) {
    return <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">Sin recartelado pendiente. Se genera solo al aplicar un import con cambios de precio (últimos 7 días).</div>
  }
  return <div className="space-y-4">{listas.map((l) => <ListaCard key={l.id} lista={l} />)}</div>
}

function ListaCard({ lista }: { lista: ListaRecartelado }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function api(body: any) {
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/recartelado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      return j
    } finally { setBusy(false) }
  }

  async function generarTareas() {
    try { const j = await api({ accion: 'generar_tareas', lista_id: lista.id }); toast.success(j.ya ? 'La tarea ya existía.' : 'Tarea de recartelado creada.'); router.refresh() } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }
  async function marcarHecho() {
    try { await api({ accion: 'marcar', lista_id: lista.id, estado: 'hecho' }); toast.success('Marcado como hecho.'); router.refresh() } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }
  function exportar() {
    exportExcel(`recartelado-${lista.sucursal}-${lista.fecha}`.replace(/\s+/g, '-').toLowerCase(),
      lista.items.map((i) => ({ SKU: i.sku ?? '', Producto: i.nombre, 'Precio viejo': i.precio_viejo, 'Precio nuevo': i.precio_nuevo })), { sheet: 'recartelado' })
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-primary" />
          <span className="font-medium">{lista.sucursal}</span>
          <span className="text-xs text-muted-foreground">{lista.fecha} · {lista.items.length} carteles</span>
          <Badge variant={lista.estado === 'hecho' ? 'success' : 'warning'} className="text-[10px]">{lista.estado}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportar}><Download className="size-4" /> Excel</Button>
          {lista.tarea_id ? (
            <Button size="sm" variant="outline" disabled><Check className="size-4" /> Tarea creada</Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={generarTareas}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />} Generar tarea</Button>
          )}
          {lista.estado !== 'hecho' && <Button size="sm" variant="ghost" disabled={busy} onClick={marcarHecho}><Check className="size-4" /> Hecho</Button>}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-1.5">Producto</th><th className="px-3 py-1.5 text-right">Precio viejo</th><th className="px-3 py-1.5 text-right">Precio nuevo</th></tr></thead>
          <tbody>
            {lista.items.map((i) => {
              const sube = i.precio_nuevo > i.precio_viejo
              return (
                <tr key={i.id} className="border-t border-border/60">
                  <td className="px-3 py-1.5"><div>{i.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{i.sku}</div></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{money(i.precio_viejo)}</td>
                  <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', sube ? 'text-rose-600' : 'text-emerald-600')}>{money(i.precio_nuevo)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
