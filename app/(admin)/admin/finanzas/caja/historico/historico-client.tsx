'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Download, ImageIcon, ShieldAlert, TrendingDown } from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type ArqueoRow = {
  id: string; sucursal: string; sucursal_id: string; fecha: string; cajero: string; cajero_id: string | null
  inicio: number; efectivo: number; mercadopago: number; tarjetas: number; declarado: number; sistema: number
  diferencia: number; estado: string; observacion: string | null; captura_url: string | null
  ventas_reales: number | null; desvio_ventas: number | null; sospechoso: boolean
}
export type DescuadreCajero = { cajero: string; arqueos: number; observados: number; suma_abs_diferencia: number }

export function HistoricoClient({ rows, ranking, sospechosos }: { rows: ArqueoRow[]; ranking: DescuadreCajero[]; sospechosos: number }) {
  const [fEstado, setFEstado] = useState('todos')
  const [fCajero, setFCajero] = useState('todos')
  const [q, setQ] = useState('')

  const cajeros = useMemo(() => Array.from(new Set(rows.map((r) => r.cajero))).sort(), [rows])

  const filtradas = useMemo(() => rows.filter((r) => {
    if (fEstado === 'observada' && r.estado !== 'observada' && r.diferencia === 0) return false
    if (fEstado === 'sospechoso' && !r.sospechoso) return false
    if (fEstado === 'cerrada' && r.estado !== 'cerrada') return false
    if (fCajero !== 'todos' && r.cajero !== fCajero) return false
    if (q.trim() && !r.sucursal.toLowerCase().includes(q.toLowerCase()) && !r.cajero.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [rows, fEstado, fCajero, q])

  function exportar() {
    exportExcel('historico-caja', filtradas.map((r) => ({
      Fecha: r.fecha, Sucursal: r.sucursal, Cajero: r.cajero, Inicio: r.inicio, Efectivo: r.efectivo,
      MercadoPago: r.mercadopago, Tarjetas: r.tarjetas, Declarado: r.declarado, Sistema: r.sistema,
      Diferencia: r.diferencia, Ventas_reales: r.ventas_reales ?? '', Desvio_vs_ventas: r.desvio_ventas ?? '',
      Estado: r.estado, Sospechoso: r.sospechoso ? 'Sí' : 'No', Observacion: r.observacion ?? '',
    })), { sheet: 'Arqueos' })
  }

  return (
    <div className="space-y-4">
      {/* Control anti-robo */}
      {sospechosos > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <div className="text-sm font-medium text-amber-700">NORA · {sospechosos} cierre{sospechosos === 1 ? '' : 's'} con descuadre o desvío vs ventas</div>
            <div className="text-xs text-muted-foreground">Cierres con diferencia ≠ $0 o cuyo declarado se aparta &gt;10% de las ventas reales del día. Revisá la captura y cruzá con SIFACO.</div>
          </div>
        </div>
      )}

      {/* Ranking de descuadres por cajero */}
      {ranking.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><TrendingDown className="size-4 text-rose-500" /> Descuadres por cajero</div>
          <div className="space-y-1">
            {ranking.slice(0, 6).map((c) => (
              <div key={c.cajero} className="flex items-center justify-between text-sm">
                <span>{c.cajero}</span>
                <span className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{c.observados}/{c.arqueos} descuadrados</Badge>
                  <span className="font-mono tabular-nums text-rose-600">{formatARS(c.suma_abs_diferencia)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar sucursal/cajero…" className="h-9 w-52" />
        <Select value={fEstado} onValueChange={setFEstado}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="cerrada">Cuadrados ($0)</SelectItem>
            <SelectItem value="observada">Descuadrados</SelectItem>
            <SelectItem value="sospechoso">Sospechosos (NORA)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fCajero} onValueChange={setFCajero}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos los cajeros</SelectItem>{cajeros.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto" disabled={!filtradas.length} onClick={exportar}><Download className="size-4" /> Excel</Button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Cajero</th>
              <th className="px-3 py-2 text-right">Declarado</th><th className="px-3 py-2 text-right">Dif. cierre</th>
              <th className="px-3 py-2 text-right">Ventas reales</th><th className="px-3 py-2 text-right">Desvío</th>
              <th className="px-3 py-2">Estado</th><th className="px-3 py-2">Captura</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((r) => (
              <tr key={r.id} className={cn('border-t border-border', r.sospechoso && 'bg-amber-500/5')}>
                <td className="px-3 py-1.5 text-xs">{r.fecha}</td>
                <td className="px-3 py-1.5">{r.sucursal}</td>
                <td className="px-3 py-1.5">{r.cajero}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(r.declarado)}</td>
                <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', r.diferencia !== 0 && 'text-rose-600')}>{r.diferencia === 0 ? '$0 ✓' : formatARS(r.diferencia)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{r.ventas_reales != null ? formatARS(r.ventas_reales) : '—'}</td>
                <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', (r.desvio_ventas ?? 0) !== 0 && 'text-amber-600')}>{r.desvio_ventas != null ? formatARS(r.desvio_ventas) : '—'}</td>
                <td className="px-3 py-1.5">
                  {r.sospechoso ? <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="size-3" /> revisar</Badge>
                    : <Badge variant="success" className="font-normal">ok</Badge>}
                </td>
                <td className="px-3 py-1.5">
                  {r.captura_url ? <a href={r.captura_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ImageIcon className="size-3.5" /> ver</a> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sin arqueos con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
