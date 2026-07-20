'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ShoppingCart, PackagePlus, PackageX, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ExisteRow = { producto_id: string; nombre: string; sku: string | null; veces: number; stock: number; sucursales: string[] }
export type LibreRow = { texto: string; veces: number; sucursales: string[] }

export function DemandaClient({ existe, libre, dias }: { existe: ExisteRow[]; libre: LibreRow[]; dias: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function post(body: any, key: string, ok: string) {
    setBusy(key)
    try {
      const r = await fetch('/api/compras/demanda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok, j.codigo ? { description: `Orden ${j.codigo} · ${j.proveedor ?? ''}` } : undefined)
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  function exportar() {
    const filas = [
      ...existe.map((r) => ({ Lista: 'Existe pero faltó', Item: r.nombre, SKU: r.sku, Veces: r.veces, 'Stock actual': r.stock, Sucursales: r.sucursales.join(', ') })),
      ...libre.map((r) => ({ Lista: 'No lo trabajamos', Item: r.texto, SKU: '', Veces: r.veces, 'Stock actual': '', Sucursales: r.sucursales.join(', ') })),
    ]
    exportExcel('radar-demanda', filas)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => router.push(`/admin/compras/demanda?dias=${d}`)} className={cn('rounded px-3 py-1 text-xs font-medium', dias === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{d}d</button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportar} disabled={!existe.length && !libre.length}><Download className="size-4" /> Excel</Button>
      </div>

      {existe.length === 0 && libre.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Nada en el Radar todavía. Cada "Me pidieron y no había" cae acá.</div>
        </div>
      )}

      {existe.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><PackageCheck className="size-4 text-amber-500" /> Existe pero faltó <Badge variant="outline" className="font-normal">{existe.length}</Badge></h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Veces</th><th className="px-3 py-2 text-right">Stock hoy</th><th className="px-3 py-2">Sucursales</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {existe.map((r) => (
                  <tr key={r.producto_id} className="border-t border-border">
                    <td className="px-3 py-1.5"><span className="font-medium">{r.nombre}</span> <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span></td>
                    <td className="px-3 py-1.5 text-right"><Badge variant={r.veces >= 3 ? 'destructive' : 'secondary'} className="font-normal tabular-nums">{r.veces}</Badge></td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', r.stock === 0 && 'text-rose-600 dark:text-rose-400')}>{r.stock}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursales.join(', ') || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.producto_id} onClick={() => post({ accion: 'agregar_orden', producto_id: r.producto_id, nombre: r.nombre }, r.producto_id, 'Agregado a la orden borrador.')}><ShoppingCart className="size-3.5" /> A orden</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {libre.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><PackageX className="size-4 text-rose-500" /> No lo trabajamos <Badge variant="outline" className="font-normal">{libre.length}</Badge></h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Lo que piden</th><th className="px-3 py-2 text-right">Veces</th><th className="px-3 py-2">Sucursales</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {libre.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{r.texto}</td>
                    <td className="px-3 py-1.5 text-right"><Badge variant={r.veces >= 3 ? 'destructive' : 'secondary'} className="font-normal tabular-nums">{r.veces}</Badge></td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursales.join(', ') || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.texto} onClick={() => post({ accion: 'alta_producto', nombre: r.texto }, r.texto, `"${r.texto}" dado de alta al catálogo.`)}><PackagePlus className="size-3.5" /> Dar de alta</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
