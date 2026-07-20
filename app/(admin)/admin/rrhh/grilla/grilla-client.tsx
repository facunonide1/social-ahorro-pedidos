'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SemanaCobertura } from '@/lib/personas/cobertura'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function GrillaClient({ sucursales, sucursalId, week, cobertura, prevHoras }: {
  sucursales: { id: string; nombre: string }[]; sucursalId: string; week: string; cobertura: SemanaCobertura; prevHoras: number
}) {
  const router = useRouter()
  const nav = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ suc: sucursalId, w: week, ...params })
    router.push(`/admin/rrhh/grilla?${sp.toString()}`)
  }
  const delta = cobertura.horasDescubiertas - prevHoras
  const horas = Array.from({ length: cobertura.cierre - cobertura.apertura }, (_, i) => cobertura.apertura + i)
  const enRiesgo = cobertura.horasDescubiertas > cobertura.umbral

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sucursalId} onValueChange={(v) => nav({ suc: v })}>
          <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => nav({ w: sumarDias(week, -7) })}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-[150px] text-center text-sm font-medium">{cobertura.desde} → {cobertura.hasta}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => nav({ w: sumarDias(week, 7) })}><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      {/* KPI horas descubiertas */}
      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-4', enRiesgo ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-card')}>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Horas descubiertas esta semana</div>
          <div className={cn('text-3xl font-bold tabular-nums', enRiesgo ? 'text-rose-600 dark:text-rose-400' : 'text-foreground')}>{cobertura.horasDescubiertas}h</div>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {delta === 0 ? <Minus className="size-4" /> : delta < 0 ? <TrendingDown className="size-4 text-emerald-500" /> : <TrendingUp className="size-4 text-rose-500" />}
          {delta === 0 ? 'igual que la semana pasada' : `${delta > 0 ? '+' : ''}${delta}h vs. semana anterior`}
        </div>
        {enRiesgo && <span className="ml-auto flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" /> Supera el umbral ({cobertura.umbral}h)</span>}
      </div>

      {/* Grilla días × horas */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-2 py-1.5 text-left font-medium text-muted-foreground">Hora</th>
              {cobertura.dias.map((d, i) => (
                <th key={d.fecha} className="px-2 py-1.5 text-center font-medium">
                  <div>{DIAS[i]}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{d.fecha.slice(8)}/{d.fecha.slice(5, 7)}{d.horasDescubiertas > 0 && <span className="ml-1 text-rose-500">·{d.horasDescubiertas}h</span>}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map((h) => (
              <tr key={h} className="border-t border-border/60">
                <td className="sticky left-0 z-10 bg-background px-2 py-1 font-mono text-muted-foreground">{String(h).padStart(2, '0')}–{String(h + 1).padStart(2, '0')}</td>
                {cobertura.dias.map((d) => {
                  const f = d.franjas.find((x) => x.hora === h)!
                  const farma = f.presentes.filter((p) => p.esFarma)
                  return (
                    <td key={d.fecha} className={cn('px-1 py-1 text-center align-middle', f.cubierta ? 'bg-emerald-500/10' : 'bg-rose-500/15')}
                      title={f.presentes.length ? f.presentes.map((p) => `${p.nombre}${p.esFarma ? ' (farmac.)' : p.rol ? ` (${p.rol})` : ''}`).join(', ') : 'nadie'}>
                      {f.cubierta
                        ? <span className="text-[10px] text-emerald-700 dark:text-emerald-400">{farma[0]?.nombre.split(' ')[0] ?? '✓'}</span>
                        : <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400">sin farm.</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Verde = farmacéutico presente. Rojo = franja del horario de atención ({String(cobertura.apertura).padStart(2, '0')}–{String(cobertura.cierre).padStart(2, '0')}) sin farmacéutico. Los turnos se cargan en la ficha de cada empleado.</p>
    </div>
  )
}
