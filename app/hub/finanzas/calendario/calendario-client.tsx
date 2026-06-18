'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, CalendarDays } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Vencimiento = { id: string; tipo: string; concepto: string; fecha: string; monto: number; href: string }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TIPO_COLOR: Record<string, string> = { Factura: 'bg-violet-500', 'Gasto fijo': 'bg-sky-500', Impuesto: 'bg-amber-500', Cheque: 'bg-emerald-500' }

export function CalendarioClient({ vencimientos, hoy }: { vencimientos: Vencimiento[]; hoy: string }) {
  const [y0, m0] = hoy.split('-').map(Number)
  const [ym, setYm] = useState({ y: y0, m: m0 - 1 }) // m: 0-index
  const [diaSel, setDiaSel] = useState<string | null>(null)

  const porDia = useMemo(() => {
    const map: Record<string, Vencimiento[]> = {}
    for (const v of vencimientos) (map[v.fecha] ??= []).push(v)
    return map
  }, [vencimientos])

  const primeroSemana = (() => { const d = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay(); return d === 0 ? 6 : d - 1 })() // lunes=0
  const diasMes = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate()
  const celdas: (string | null)[] = [...Array(primeroSemana).fill(null), ...Array.from({ length: diasMes }, (_, i) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)]

  const totalMes = celdas.filter(Boolean).reduce((a, f) => a + (porDia[f!] ?? []).reduce((s, v) => s + v.monto, 0), 0)
  const items = diaSel ? (porDia[diaSel] ?? []) : []

  function nav(delta: number) {
    setDiaSel(null)
    setYm((p) => { const n = p.m + delta; return { y: p.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 } })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="size-8" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
        <div className="min-w-[160px] text-center text-sm font-semibold">{MESES[ym.m]} {ym.y}</div>
        <Button variant="outline" size="icon" className="size-8" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
        <div className="text-xs text-muted-foreground">Total del mes: <b className="text-foreground">{formatARS(totalMes)}</b></div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => exportExcel(`calendario-${ym.y}-${ym.m + 1}`, vencimientos.filter((v) => v.fecha.startsWith(`${ym.y}-${String(ym.m + 1).padStart(2, '0')}`)).map((v) => ({ Fecha: v.fecha, Tipo: v.tipo, Concepto: v.concepto, Monto: v.monto })))}><Download className="size-4" /> Excel</Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => <div key={d} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d}</div>)}
        {celdas.map((fecha, i) => {
          if (!fecha) return <div key={i} className="min-h-[72px] rounded-md" />
          const dia = Number(fecha.slice(-2))
          const vs = porDia[fecha] ?? []
          const total = vs.reduce((s, v) => s + v.monto, 0)
          const esHoy = fecha === hoy
          const vencido = fecha < hoy && vs.length > 0
          return (
            <button key={fecha} type="button" onClick={() => setDiaSel(vs.length ? fecha : null)}
              className={cn('flex min-h-[72px] flex-col gap-1 rounded-md border p-1.5 text-left transition-colors',
                diaSel === fecha ? 'border-primary ring-1 ring-primary' : 'border-border',
                vs.length ? 'hover:bg-accent/50' : 'opacity-60',
                vencido && 'bg-rose-500/5')}>
              <span className={cn('text-xs font-medium', esHoy && 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground')}>{dia}</span>
              {vs.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-0.5">{vs.slice(0, 4).map((v) => <span key={v.id} className={cn('size-1.5 rounded-full', TIPO_COLOR[v.tipo] ?? 'bg-muted-foreground')} />)}</div>
                  <span className={cn('mt-auto font-mono text-[10px] tabular-nums', vencido ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{formatARS(total)}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {Object.entries(TIPO_COLOR).map(([t, c]) => <span key={t} className="flex items-center gap-1"><span className={cn('size-2 rounded-full', c)} /> {t}</span>)}
      </div>

      {diaSel && (
        <div className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold"><CalendarDays className="size-4" /> Vencimientos del {diaSel}</div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="border-t border-border first:border-t-0">
                  <td className="px-3 py-1.5"><span className={cn('mr-2 inline-block size-2 rounded-full align-middle', TIPO_COLOR[v.tipo] ?? 'bg-muted-foreground')} /><span className="text-xs text-muted-foreground">{v.tipo}</span></td>
                  <td className="px-3 py-1.5">{v.concepto}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(v.monto)}</td>
                  <td className="px-3 py-1.5 text-right"><Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href={v.href}>Ver</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
