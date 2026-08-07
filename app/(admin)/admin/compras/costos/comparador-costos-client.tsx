'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, Scale, Search, TrendingDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { FilaComparador } from '@/lib/documentos/costos'

const TODOS = '__all__'

export function ComparadorCostosClient({
  filas,
  proveedores,
  totalAhorro,
  soloFacturas,
  diasFresco,
  diasVolumen,
}: {
  filas: FilaComparador[]
  proveedores: Array<{ id: string; nombre: string }>
  totalAhorro: number
  soloFacturas: boolean
  diasFresco: number
  diasVolumen: number
}) {
  const router = useRouter()
  const search = useSearchParams()
  const [q, setQ] = useState('')
  const [prov, setProv] = useState(TODOS)
  const [soloFrescos, setSoloFrescos] = useState(false)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return filas.filter((f) => {
      if (t && !`${f.sku} ${f.nombre}`.toLowerCase().includes(t)) return false
      if (prov !== TODOS && !f.celdas[prov]) return false
      if (soloFrescos && !Object.values(f.celdas).some((c) => c.fresco)) return false
      return true
    })
  }, [filas, q, prov, soloFrescos])

  function toggleFuente() {
    const p = new URLSearchParams(search.toString())
    if (soloFacturas) p.set('solo', 'todo')
    else p.delete('solo')
    router.replace(`?${p.toString()}`)
  }

  const conAhorro = rows.filter((r) => r.ahorroPotencial > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU o descripción…" className="h-9 pl-8" />
        </div>
        <Select value={prov} onValueChange={setProv}>
          <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Proveedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los proveedores</SelectItem>
            {proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={soloFrescos ? 'default' : 'outline'} onClick={() => setSoloFrescos((s) => !s)}>
          Dato fresco
        </Button>
        <Button size="sm" variant="outline" onClick={toggleFuente}>
          {soloFacturas ? 'Solo facturas' : 'Incluye listas'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!rows.length}
          onClick={() => exportExcel('comparador-costos', rows.map((f) => {
            // Regla de oro: SKU en la primera columna.
            const base: Record<string, unknown> = {
              SKU: f.sku,
              Producto: f.nombre,
              'Último pagado': f.ultimoPagado?.neto ?? '',
              'Mejor disponible': f.mejor?.neto ?? '',
              [`Unidades ${diasVolumen}d`]: f.unidades90,
              'Ahorro potencial': f.ahorroPotencial || '',
            }
            for (const p of proveedores) {
              const c = f.celdas[p.id]
              base[p.nombre] = c ? c.neto : ''
              base[`${p.nombre} (días)`] = c ? c.diasDesde : ''
            }
            return base
          }))}
        >
          <Download className="size-4" /> Excel
        </Button>
      </div>

      {totalAhorro > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <TrendingDown className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              Comprando cada producto a quien lo tiene más barato hoy, sobre lo que ya compraste en los
              últimos {diasVolumen} días, la diferencia sería{' '}
              <b className="text-emerald-700 dark:text-emerald-300">{formatARS(totalAhorro)}</b>.
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Calculado solo con proveedores de dato fresco (menos de {diasFresco} días). No incluye
              plazos de pago ni mínimos de compra.
            </div>
          </div>
        </div>
      )}

      {!rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Scale className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {filas.length
              ? 'Ningún producto coincide con el filtro.'
              : 'Todavía no hay compras cargadas. Subí facturas para empezar a comparar.'}
          </div>
          {!filas.length && (
            <Link href="/admin/finanzas/documentos/lote" className="text-sm text-primary hover:underline">
              Cargar facturas en lote →
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-normal">SKU</th>
                <th className="px-3 py-2 font-normal">Producto</th>
                {proveedores.map((p) => <th key={p.id} className="px-3 py-2 text-right font-normal">{p.nombre}</th>)}
                <th className="px-3 py-2 text-right font-normal">Ahorro</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((f) => (
                <tr key={f.itemId} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    <Link href={`/admin/compras/costos/${f.itemId}`} className="text-primary hover:underline">{f.sku}</Link>
                  </td>
                  <td className="px-3 py-1.5">{f.nombre}</td>
                  {proveedores.map((p) => {
                    const c = f.celdas[p.id]
                    // Sin dato no hay celda: cero sería mentira, vacío es la verdad.
                    if (!c) return <td key={p.id} className="px-3 py-1.5 text-right text-muted-foreground">—</td>
                    const esMejor = f.mejor?.proveedorId === p.id
                    return (
                      <td
                        key={p.id}
                        className={cn(
                          'px-3 py-1.5 text-right font-mono tabular-nums',
                          esMejor && 'bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300',
                          !c.fresco && 'text-muted-foreground',
                        )}
                        title={!c.fresco ? `Dato de hace ${c.diasDesde} días — no es comparable con uno reciente` : `${c.fecha} · ${c.origen}`}
                      >
                        {formatARS(c.neto)}
                        {!c.fresco && <span className="ml-1 text-[9px]">({c.diasDesde}d)</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {f.ahorroPotencial > 0
                      ? <span className="text-emerald-600 dark:text-emerald-400">{formatARS(f.ahorroPotencial)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 300 && (
            <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Mostrando 300 de {rows.length}. Afiná el filtro o exportá a Excel para verlos todos.
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Todos los importes son <b>netos, sin IVA</b>: el IVA es crédito fiscal, no costo.
        {conAhorro.length > 0 && ` ${conAhorro.length} producto${conAhorro.length === 1 ? ' tiene' : 's tienen'} una alternativa más barata con dato reciente.`}
      </p>
    </div>
  )
}
