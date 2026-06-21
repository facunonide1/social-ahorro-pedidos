'use client'

import { useRouter } from 'next/navigation'
import { Download, Trophy } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type RankRow = { sku: string; descripcion: string | null; producto_id: string | null; cantidad: number; monto: number; dias: number }
type CompRow = { sucursal_id: string; nombre: string; unidades: number; monto: number }

export function VentasDiariasClient({
  desde, hasta, ranking, comparativa, esTodas,
}: { desde: string; hasta: string; ranking: RankRow[]; comparativa: CompRow[]; esTodas: boolean }) {
  const router = useRouter()

  function setRango(d: string, h: string) {
    const sp = new URLSearchParams(); sp.set('desde', d); sp.set('hasta', h)
    router.push(`/admin/centro-datos/ventas-diarias?${sp.toString()}`)
  }

  function exportar() {
    if (!ranking.length) return
    exportExcel(`ventas-diarias_${desde}_${hasta}`, ranking.map((r) => ({
      CODIGO: r.sku, Descripción: r.descripcion ?? '', Unidades: Math.round(r.cantidad),
      Monto: Math.round(r.monto), Días: r.dias, En_catálogo: r.producto_id ? 'Sí' : 'No',
    })), { sheet: 'Ventas' })
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} className="h-9" onChange={(e) => setRango(e.target.value, hasta)} /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} className="h-9" onChange={(e) => setRango(desde, e.target.value)} /></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { const d = new Date().toISOString().slice(0, 10); setRango(d, d) }}>Hoy</Button>
          <Button variant="outline" size="sm" onClick={() => { const h = new Date().toISOString().slice(0, 10); const d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10); setRango(d, h) }}>7 días</Button>
          <Button variant="outline" size="sm" disabled={!ranking.length} onClick={exportar}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      {/* Ranking más vendidos */}
      {ranking.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium"><Trophy className="size-4 text-amber-500" /> Más vendidos {esTodas ? '(todas las sucursales)' : ''}</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 w-8">#</th><th className="px-3 py-2">CODIGO</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Unidades</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2 text-right">Días</th></tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.sku} className="border-t border-border/60">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.sku}</td>
                  <td className="px-3 py-1.5 max-w-[280px] truncate">{r.descripcion ?? '—'} {!r.producto_id && <span className="text-[10px] text-amber-600">(sin catálogo)</span>}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{Math.round(r.cantidad).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-1.5 text-right">${Math.round(r.monto).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{r.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
