'use client'

import { useMemo, useState } from 'react'
import { Search, Download, Scale, Sparkles, TrendingUp, Check } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Oferta = { proveedor_id: string; proveedor: string; precio: number; precioFinal: number; condicion: string; descPP: number; subio: boolean }
export type ProductoComp = { producto_id: string; nombre: string; sku: string | null; ofertas: Oferta[] }
export type ProvLite = { id: string; nombre: string; plazo: number | null; forma: string | null }

export function ComparadorClient({ productos, proveedores, rubro }: { productos: ProductoComp[]; proveedores: ProvLite[]; rubro: string }) {
  const [q, setQ] = useState('')
  const [split, setSplit] = useState(false)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return productos.filter((p) => !t || `${p.nombre} ${p.sku ?? ''}`.toLowerCase().includes(t))
  }, [productos, q])

  // Smart split: cada producto al proveedor más barato (precio final). Agrupado por proveedor.
  const smart = useMemo(() => {
    const porProv = new Map<string, { proveedor: string; items: { nombre: string; precio: number }[]; total: number }>()
    let ahorro = 0
    for (const p of productos) {
      if (!p.ofertas.length) continue
      const mejor = p.ofertas[0]
      const peor = p.ofertas[p.ofertas.length - 1]
      ahorro += peor.precioFinal - mejor.precioFinal
      const e = porProv.get(mejor.proveedor_id) ?? { proveedor: mejor.proveedor, items: [], total: 0 }
      e.items.push({ nombre: p.nombre, precio: mejor.precioFinal }); e.total += mejor.precioFinal
      porProv.set(mejor.proveedor_id, e)
    }
    return { grupos: [...porProv.values()].sort((a, b) => b.total - a.total), ahorro }
  }, [productos])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por nombre o SKU…" className="h-9 pl-8" />
        </div>
        <Button variant={split ? 'default' : 'outline'} size="sm" onClick={() => setSplit((s) => !s)}><Sparkles className="size-4" /> Smart split</Button>
        <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportExcel('comparador', rows.flatMap((p) => p.ofertas.map((o, i) => ({ SKU: p.sku ?? '', Producto: p.nombre, Proveedor: o.proveedor, Precio: o.precio, 'Precio final': o.precioFinal, Condicion: o.condicion, Mejor: i === 0 ? 'sí' : '' }))))}><Download className="size-4" /> Excel</Button>
      </div>

      {split && (
        <div className="rounded-lg border border-primary/40 bg-nora-bg p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Smart split óptimo {rubro !== 'todos' && <span className="text-muted-foreground">· {rubro}</span>}</div>
          {smart.grupos.length === 0 ? <p className="text-sm text-muted-foreground">Cargá listas de precios para calcular el split.</p> : (
            <>
              <p className="mb-3 text-sm">Comprando cada producto a su proveedor más barato, el ahorro estimado vs comprar todo al más caro es <b className="text-emerald-600 dark:text-emerald-400">{formatARS(smart.ahorro)}</b>.</p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {smart.grupos.map((g, i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">{g.proveedor}</span><span className="font-mono text-xs tabular-nums">{formatARS(g.total)}</span></div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{g.items.length} producto(s)</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Scale className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Importá listas de precios de tus droguerías para empezar a comparar.</div>
          <a href="/admin/compras/listas-precios" className="text-sm text-primary hover:underline">Ir a Listas de precios →</a>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 60).map((p) => (
            <div key={p.producto_id} className="rounded-lg border border-border">
              <div className="flex items-baseline justify-between border-b border-border px-4 py-2">
                <div className="font-medium">{p.nombre} <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span></div>
                <div className="text-xs text-muted-foreground">{p.ofertas.length} proveedor(es)</div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {p.ofertas.map((o, i) => (
                    <tr key={o.proveedor_id} className={cn('border-t border-border/60 first:border-t-0', i === 0 && 'bg-emerald-500/5')}>
                      <td className="px-4 py-1.5">{o.proveedor} {i === 0 && <Badge variant="success" className="ml-1 font-normal"><Check className="mr-0.5 size-3" />mejor</Badge>}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{o.condicion}{o.descPP > 0 && ` · -${o.descPP}% PP`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{o.subio && <TrendingUp className="mr-1 inline size-3 text-rose-500" />}{formatARS(o.precio)}</td>
                      <td className="px-4 py-1.5 text-right font-mono font-medium tabular-nums">{formatARS(o.precioFinal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
