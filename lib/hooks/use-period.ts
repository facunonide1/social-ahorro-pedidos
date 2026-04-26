'use client'

import { useMemo } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  usePeriodStore,
  calcularRango,
  calcularComparativa,
  type PeriodPreset,
} from '@/lib/stores/period-store'

/**
 * Hook ergonómico sobre `period-store`.
 *
 * Calcula el `range` actual a partir del preset (o del custom range),
 * y expone helpers para encadenar filtros de Supabase y formatear el
 * período para mostrarlo en UI.
 *
 * @example
 *   const { range, buildSupabaseFilter, formatRange } = usePeriod()
 *   let q = sb.from('facturas').select('*')
 *   q = buildSupabaseFilter(q, 'fecha_emision')
 */
export function usePeriod() {
  const preset       = usePeriodStore((s) => s.preset)
  const customFrom   = usePeriodStore((s) => s.customFrom)
  const customTo     = usePeriodStore((s) => s.customTo)
  const comparativa  = usePeriodStore((s) => s.comparativa)
  const isHydrated   = usePeriodStore((s) => s.isHydrated)
  const setPreset    = usePeriodStore((s) => s.setPreset)
  const setCustomRange = usePeriodStore((s) => s.setCustomRange)
  const toggleComparativa = usePeriodStore((s) => s.toggleComparativa)

  const range = useMemo(() => {
    if (preset === 'personalizado' && customFrom && customTo) {
      return {
        from: new Date(`${customFrom}T00:00:00`),
        to:   new Date(`${customTo}T23:59:59`),
      }
    }
    return calcularRango(preset)
  }, [preset, customFrom, customTo])

  const previousRange = useMemo(() => {
    if (!comparativa) return null
    return calcularComparativa(range.from, range.to)
  }, [range, comparativa])

  const daysInRange = useMemo(
    () => Math.max(1, differenceInCalendarDays(range.to, range.from) + 1),
    [range],
  )

  /**
   * Encadena `.gte().lte()` sobre un query builder de Supabase.
   * Devuelve el mismo builder para seguir encadenando.
   */
  function buildSupabaseFilter<T extends { gte: any; lte: any }>(query: T, field: string): T {
    return (query as any).gte(field, range.from.toISOString()).lte(field, range.to.toISOString())
  }

  /** "1 - 30 abril 2026" o "abr 2026" según el largo del período. */
  function formatRange(): string {
    const sameMonth = range.from.getMonth() === range.to.getMonth() && range.from.getFullYear() === range.to.getFullYear()
    if (sameMonth) {
      return `${format(range.from, 'd', { locale: es })} – ${format(range.to, 'd MMM yyyy', { locale: es })}`
    }
    return `${format(range.from, 'd MMM yyyy', { locale: es })} – ${format(range.to, 'd MMM yyyy', { locale: es })}`
  }

  return {
    preset,
    range,
    previousRange,
    comparativa,
    daysInRange,
    isHydrated,
    setPreset,
    setCustomRange,
    toggleComparativa,
    buildSupabaseFilter,
    formatRange,
  }
}

export type { PeriodPreset }
