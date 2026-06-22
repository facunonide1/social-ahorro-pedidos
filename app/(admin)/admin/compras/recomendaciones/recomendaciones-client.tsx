'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, AlertTriangle, Moon, TrendingUp, TrendingDown, Minus, Database,
  Download, Plus, Zap, Package, Tag,
} from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CLASIF_LABEL, type Recomendacion, type Dormido, type Resumen, type Tendencia,
} from '@/lib/compras/recomendaciones'

const CLASIF_CLS: Record<string, string> = {
  alta: 'text-emerald-600 border-emerald-500/30', media: 'text-blue-600 border-blue-500/30',
  baja: 'text-amber-600 border-amber-500/30', sin_venta: 'text-muted-foreground',
}

function TendenciaIcon({ t }: { t: Tendencia }) {
  if (t === 'subiendo') return <TrendingUp className="size-3.5 text-emerald-600" />
  if (t === 'bajando') return <TrendingDown className="size-3.5 text-rose-600" />
  if (t === 'estable') return <Minus className="size-3.5 text-muted-foreground" />
  return null
}

export function RecomendacionesClient({
  recomendaciones, quiebres, dormido, resumen, dias, sucursalId,
}: {
  recomendaciones: Recomendacion[]; quiebres: Recomendacion[]; dormido: Dormido[]
  resumen: Resumen; dias: number; sucursalId: string | null
}) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const elegidos = useMemo(() => recomendaciones.filter((r) => sel.has(r.producto_id)), [recomendaciones, sel])

  function armarOrden(items: Recomendacion[]) {
    if (!items.length) return
    const recom = items.map((r) => `${r.producto_id}-${r.sugerido}`).join(',')
    const sucParam = sucursalId ? `&suc=${sucursalId}` : ''
    router.push(`/admin/compras/ordenes/nueva?recom=${recom}${sucParam}`)
  }

  // ---- Empty state: sin ventas cargadas ----
  if (!resumen.hayVentas) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Database className="size-9 text-muted-foreground" />
        <div className="text-base font-medium">Todavía no hay ventas para recomendar</div>
        <p className="max-w-md text-sm text-muted-foreground">
          Las recomendaciones de compra se calculan con las ventas reales por SKU. Cargá el archivo de ventas del día en el Centro de Datos y volvé.
        </p>
        <Button asChild><Link href="/admin/centro-datos/ventas-diarias"><Database className="size-4" /> Cargar ventas del día</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={ShoppingCart} label="A reponer" value={`${resumen.nRecomendados} productos`} />
        <Kpi icon={Zap} label="Quiebres inminentes" value={String(resumen.nUrgentes)} variant={resumen.nUrgentes > 0 ? 'danger' : 'default'} />
        <Kpi icon={Package} label="Costo reposición" value={formatARS(resumen.costoReposicion)} />
        <Kpi icon={Moon} label="Dinero dormido" value={formatARS(resumen.plataDormida)} variant={resumen.plataDormida > 0 ? 'warning' : 'default'} />
      </div>

      <Tabs defaultValue="comprar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comprar">Qué comprar ({recomendaciones.length})</TabsTrigger>
          <TabsTrigger value="quiebres">Quiebres ({quiebres.length})</TabsTrigger>
          <TabsTrigger value="dormido">Dinero dormido ({dormido.length})</TabsTrigger>
        </TabsList>

        {/* ===== QUÉ COMPRAR ===== */}
        <TabsContent value="comprar" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">Según las ventas de los últimos {dias} días. Sugerido = cubrir {dias} días de venta.</p>
            {elegidos.length > 0 && <Button size="sm" className="ml-auto" onClick={() => armarOrden(elegidos)}><ShoppingCart className="size-4" /> Armar orden ({elegidos.length})</Button>}
          </div>
          <TablaRecom rows={recomendaciones} sel={sel} toggle={toggle} onAdd={(r) => armarOrden([r])} />
        </TabsContent>

        {/* ===== QUIEBRES ===== */}
        <TabsContent value="quiebres" className="space-y-3">
          <p className="text-sm text-muted-foreground">Productos que se agotan en ≤3 días al ritmo de venta actual (o ya en cero con demanda).</p>
          {quiebres.length === 0
            ? <Vacio texto="Sin quiebres inminentes. 🎉" />
            : <TablaRecom rows={quiebres} sel={sel} toggle={toggle} onAdd={(r) => armarOrden([r])} />}
        </TabsContent>

        {/* ===== DINERO DORMIDO ===== */}
        <TabsContent value="dormido" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">Con stock pero sin ventas en los últimos {dias} días. Plata inmovilizada.</p>
            {dormido.length > 0 && <Button size="sm" variant="outline" className="ml-auto" onClick={() => exportExcel('dinero-dormido', dormido.map((d) => ({ CODIGO: d.sku, Producto: d.nombre, Rubro: d.rubro ?? '', Stock: d.stock_actual, Dias_sin_venta: d.dias_sin_venta ?? '', Plata_inmovilizada: Math.round(d.plata_inmovilizada) })))}><Download className="size-4" /> Excel</Button>}
          </div>
          {dormido.length === 0 ? <Vacio texto="Nada dormido: todo el stock rota. 👌" /> : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">CODIGO</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Días sin venta</th><th className="px-3 py-2 text-right">Plata inmovilizada</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {dormido.slice(0, 200).map((d) => (
                    <tr key={d.producto_id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{d.sku}</td>
                      <td className="px-3 py-1.5 max-w-[280px] truncate">{d.nombre}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Math.round(d.stock_actual)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{d.dias_sin_venta != null ? `${d.dias_sin_venta}d` : '+'+dias+'d'}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(d.plata_inmovilizada)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/admin/ofertas?sku=${d.sku}`}><Tag className="size-3.5" /> Liquidar</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TablaRecom({ rows, sel, toggle, onAdd }: { rows: Recomendacion[]; sel: Set<string>; toggle: (id: string) => void; onAdd: (r: Recomendacion) => void }) {
  if (!rows.length) return <Vacio texto="Sin recomendaciones con stock suficiente." />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2" />
            <th className="px-3 py-2">Producto</th><th className="px-3 py-2">Rotación</th>
            <th className="px-3 py-2 text-right">Vel. (u/día)</th><th className="px-3 py-2 text-right">Stock</th>
            <th className="px-3 py-2 text-right">Cobertura</th><th className="px-3 py-2 text-right">Sugerido</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 300).map((r) => (
            <tr key={r.producto_id} className={cn('border-t border-border', r.urgente && 'bg-rose-500/5')}>
              <td className="px-3 py-1.5"><input type="checkbox" checked={sel.has(r.producto_id)} onChange={() => toggle(r.producto_id)} className="size-4 accent-[hsl(var(--primary))]" /></td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5 max-w-[260px]">
                  <span className="truncate">{r.nombre}</span>
                  <TendenciaIcon t={r.tendencia} />
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{r.sku}</div>
              </td>
              <td className="px-3 py-1.5"><Badge variant="outline" className={cn('text-[10px]', CLASIF_CLS[r.clasificacion])}>{CLASIF_LABEL[r.clasificacion]}</Badge></td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.velocidad}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{Math.round(r.stock_actual)}</td>
              <td className={cn('px-3 py-1.5 text-right tabular-nums', r.urgente && 'font-medium text-rose-600')}>
                {r.urgente && <AlertTriangle className="mr-1 inline size-3" />}
                {r.cobertura_dias != null ? `${r.cobertura_dias}d` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.sugerido}</td>
              <td className="px-3 py-1.5 text-right">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onAdd(r)}><Plus className="size-3.5" /> orden</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, variant }: { icon: any; label: string; value: string; variant?: 'default' | 'warning' | 'danger' }) {
  return (
    <div className={cn('rounded-lg border p-3', variant === 'danger' ? 'border-rose-500/40 bg-rose-500/5' : variant === 'warning' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border')}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{texto}</div>
}
