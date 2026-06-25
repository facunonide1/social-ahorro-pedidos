'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, AlertTriangle, TrendingDown, TrendingUp, ShieldAlert, Loader2, Check, RefreshCw, PackageX } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { IrregularidadRow, ResumenIrreg, Patron } from '@/lib/operaciones/irregularidades'

const MOTIVOS = ['rotura', 'vencimiento', 'error de carga', 'robo sospechado', 'otro']

export function IrregularidadesClient({ filas, resumen, patrones, sucursales, esTodas }: {
  filas: IrregularidadRow[]; resumen: ResumenIrreg; patrones: Patron[]
  sucursales: { id: string; nombre: string }[]; esTodas: boolean
}) {
  const router = useRouter()
  const [fFecha, setFFecha] = useState<string>('')
  const [fTipo, setFTipo] = useState<string>('')
  const [fEstado, setFEstado] = useState<string>('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const visibles = useMemo(() => filas.filter((r) =>
    (!fFecha || r.fecha === fFecha) && (!fTipo || r.tipo === fTipo) && (!fEstado || r.estado === fEstado),
  ), [filas, fFecha, fTipo, fEstado])

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSel((p) => p.size === visibles.length ? new Set() : new Set(visibles.map((r) => r.id))) }

  async function marcar(estado: 'revisada' | 'justificada', nota?: string) {
    if (!sel.size) { toast.error('Elegí al menos una fila.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/irregularidades', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'marcar', ids: [...sel], estado, nota: nota ?? null }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.actualizadas} marcada(s) como ${estado}`); setSel(new Set()); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  function justificarConMotivo() {
    const m = window.prompt(`Motivo (${MOTIVOS.join(' / ')}):`, 'rotura')
    if (m) marcar('justificada', m)
  }

  function exportar() {
    exportExcel('irregularidades_stock', visibles.map((r) => ({
      Fecha: r.fecha, Sucursal: r.sucursal, SKU: r.sku, Producto: r.producto,
      'Stock anterior': r.stock_anterior, 'Ventas': r.ventas_dia, 'Esperado': r.stock_esperado,
      'Real': r.stock_real, 'Diferencia': r.diferencia, 'Valor $': r.valor_diferencia,
      Tipo: r.tipo, Estado: r.estado, Nota: r.nota ?? '',
    })))
  }

  if (filas.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <div className="text-sm font-medium">Sin irregularidades para cruzar</div>
          <div className="max-w-md text-sm text-muted-foreground">
            El cruce necesita al menos <b>dos días</b> de stock cargado por sucursal (más las ventas del medio).
            Cargá el stock un par de días seguidos en el Centro de Datos y NORA empieza a detectar descuadres.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Irregularidades" value={resumen.total.toLocaleString('es-AR')} sub={`${resumen.pendientes} pendientes`} icon={AlertTriangle} cls="text-amber-600" />
        <Kpi label="Faltantes" value={`$${resumen.valor_faltante.toLocaleString('es-AR')}`} sub={`${resumen.faltantes} casos`} icon={TrendingDown} cls="text-rose-600" />
        <Kpi label="Sobrantes" value={`$${resumen.valor_sobrante.toLocaleString('es-AR')}`} sub={`${resumen.sobrantes} casos`} icon={TrendingUp} cls="text-blue-600" />
        <Kpi label="Última foto" value={resumen.ultima_fecha ?? '—'} sub={`${resumen.fechas.length} días con cruce`} icon={RefreshCw} cls="text-muted-foreground" />
      </div>

      {/* Patrones sospechosos */}
      {patrones.length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-rose-700"><ShieldAlert className="size-4" /> Patrones sospechosos (control de robo)</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {patrones.map((p, i) => (
              <div key={i} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{p.titulo}</div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">${p.valor.toLocaleString('es-AR')}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.detalle}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros + acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fFecha || '__all__'} onValueChange={(v) => setFFecha(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Fecha" /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Todas las fechas</SelectItem>{resumen.fechas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fTipo || '__all__'} onValueChange={(v) => setFTipo(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Faltante y sobrante</SelectItem><SelectItem value="faltante">Faltantes</SelectItem><SelectItem value="sobrante">Sobrantes</SelectItem></SelectContent>
        </Select>
        <Select value={fEstado || '__all__'} onValueChange={(v) => setFEstado(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Todos</SelectItem><SelectItem value="pendiente">Pendientes</SelectItem><SelectItem value="revisada">Revisadas</SelectItem><SelectItem value="justificada">Justificadas</SelectItem></SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          {sel.size > 0 && <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => marcar('revisada')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Revisada ({sel.size})</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={justificarConMotivo}>Justificar…</Button>
          </>}
          <Button size="sm" variant="outline" onClick={exportar}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2"><input type="checkbox" checked={sel.size === visibles.length && visibles.length > 0} onChange={toggleAll} className="size-4 accent-[hsl(var(--primary))]" /></th>
              <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th>
              {esTodas && <th className="px-3 py-2">Sucursal</th>}
              <th className="px-3 py-2 text-right">Esperado</th><th className="px-3 py-2 text-right">Real</th>
              <th className="px-3 py-2 text-right">Dif.</th><th className="px-3 py-2 text-right">Valor $</th>
              <th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.slice(0, 300).map((r) => (
              <tr key={r.id} className={cn('border-t border-border/60', sel.has(r.id) && 'bg-primary/5')}>
                <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[hsl(var(--primary))]" /></td>
                <td className="px-3 py-1.5 text-xs">{r.fecha}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.sku}</td>
                <td className="px-3 py-1.5 max-w-[200px] truncate">{r.producto}</td>
                {esTodas && <td className="px-3 py-1.5 text-xs">{r.sucursal}</td>}
                <td className="px-3 py-1.5 text-right tabular-nums">{r.stock_esperado}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.stock_real}</td>
                <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', r.diferencia < 0 ? 'text-rose-600' : 'text-blue-600')}>{r.diferencia > 0 ? '+' : ''}{r.diferencia}</td>
                <td className={cn('px-3 py-1.5 text-right tabular-nums', r.tipo === 'faltante' ? 'text-rose-600' : 'text-blue-600')}>${Math.abs(r.valor_diferencia).toLocaleString('es-AR')}</td>
                <td className="px-3 py-1.5"><Badge variant="outline" className={cn('text-[10px]', r.tipo === 'faltante' ? 'border-rose-500/40 text-rose-600' : 'border-blue-500/40 text-blue-600')}>{r.tipo}</Badge></td>
                <td className="px-3 py-1.5">{r.estado === 'pendiente' ? <span className="text-xs text-amber-600">pendiente</span> : <span className="text-xs text-muted-foreground" title={r.nota ?? ''}>{r.estado}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length > 300 && <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-center text-xs text-muted-foreground">Mostrando 300 de {visibles.length}. Filtrá o exportá para ver el resto.</div>}
        {visibles.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin irregularidades con esos filtros.</div>}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, icon: Icon, cls }: { label: string; value: string; sub: string; icon: any; cls: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><Icon className={cn('size-4', cls)} /></div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
