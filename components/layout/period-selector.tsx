'use client'

import { useState } from 'react'
import { CalendarRange, ChevronsUpDown, Check, GitCompareArrows } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePeriod } from '@/lib/hooks/use-period'
import type { PeriodPreset } from '@/lib/stores/period-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const PRESETS: ReadonlyArray<{ id: PeriodPreset; label: string }> = [
  { id: 'hoy',           label: 'Hoy' },
  { id: 'ayer',          label: 'Ayer' },
  { id: 'semana',        label: 'Esta semana' },
  { id: 'mes',           label: 'Este mes' },
  { id: 'mes_pasado',    label: 'Mes pasado' },
  { id: 'trimestre',     label: 'Este trimestre' },
  { id: 'año',           label: 'Este año' },
  { id: 'personalizado', label: 'Personalizado…' },
]

/**
 * Selector global de período.
 *
 * - Dropdown con 7 presets.
 * - "Personalizado…" abre un Popover con un Calendar en modo `range`.
 * - Toggle "vs período anterior" al lado.
 */
export function PeriodSelector() {
  const {
    preset,
    range,
    comparativa,
    isHydrated,
    setPreset,
    setCustomRange,
    toggleComparativa,
    formatRange,
  } = usePeriod()

  const [openCustom, setOpenCustom] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    preset === 'personalizado' ? { from: range.from, to: range.to } : undefined,
  )

  function onPresetSelect(p: PeriodPreset) {
    if (p === 'personalizado') {
      setOpenCustom(true)
      setDraftRange({ from: range.from, to: range.to })
      return
    }
    setPreset(p)
  }

  function applyCustom() {
    if (draftRange?.from && draftRange?.to) {
      setCustomRange(draftRange.from, draftRange.to)
      setOpenCustom(false)
    }
  }

  if (!isHydrated) {
    return <Skeleton className="h-9 w-56" />
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarRange className="size-3.5 text-muted-foreground" />
            <span className="tabular-nums">{formatRange()}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Período</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => onPresetSelect(p.id)}>
              <Check className={cn('size-4', preset === p.id ? 'opacity-100' : 'opacity-0')} />
              <span>{p.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Popover lateral del custom range — sin trigger visible (lo abre el dropdown) */}
      <Popover open={openCustom} onOpenChange={setOpenCustom}>
        <PopoverTrigger asChild>
          <span className="sr-only" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="p-3">
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={2}
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border p-2">
            <Button variant="ghost" size="sm" onClick={() => setOpenCustom(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!draftRange?.from || !draftRange?.to}
              onClick={applyCustom}
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant={comparativa ? 'secondary' : 'ghost'}
        size="icon"
        className="h-9 w-9"
        title={comparativa ? 'Comparativa activa' : 'Activar comparativa'}
        aria-label={comparativa ? 'Desactivar comparativa' : 'Activar comparativa'}
        onClick={toggleComparativa}
      >
        <GitCompareArrows className="size-4" />
      </Button>
    </div>
  )
}
