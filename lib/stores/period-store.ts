import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  differenceInCalendarDays,
} from 'date-fns'

export type PeriodPreset =
  | 'hoy'
  | 'ayer'
  | 'semana'
  | 'mes'
  | 'mes_pasado'
  | 'trimestre'
  | 'año'
  | 'personalizado'

type PeriodState = {
  preset: PeriodPreset
  /** ISO `yyyy-mm-dd`. Solo se usa cuando preset === 'personalizado'. */
  customFrom: string | null
  customTo: string | null
  comparativa: boolean
  isHydrated: boolean

  setPreset: (preset: PeriodPreset) => void
  setCustomRange: (from: Date, to: Date) => void
  toggleComparativa: () => void
  setHydrated: (v: boolean) => void
  reset: () => void
}

const initial: Omit<PeriodState, 'setPreset' | 'setCustomRange' | 'toggleComparativa' | 'setHydrated' | 'reset'> = {
  preset: 'mes',
  customFrom: null,
  customTo: null,
  comparativa: false,
  isHydrated: false,
}

/**
 * Calcula el rango [from, to] correspondiente al preset.
 *
 * Para 'personalizado' no calcula nada — el caller debe usar customFrom/To.
 * Lunes como inicio de semana (default es-AR).
 */
export function calcularRango(preset: PeriodPreset, now: Date = new Date()): { from: Date; to: Date } {
  switch (preset) {
    case 'hoy':         return { from: startOfDay(now), to: endOfDay(now) }
    case 'ayer': {
      const y = subDays(now, 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case 'semana':      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
    case 'mes':         return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'mes_pasado': {
      const m = subMonths(now, 1)
      return { from: startOfMonth(m), to: endOfMonth(m) }
    }
    case 'trimestre':   return { from: startOfQuarter(now), to: endOfQuarter(now) }
    case 'año':         return { from: startOfYear(now), to: endOfYear(now) }
    case 'personalizado':
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) }
  }
}

/**
 * Período anterior del mismo largo, terminando justo antes del actual.
 * Ej: si actual es 1-30 abril, comparativa es 2-31 marzo.
 */
export function calcularComparativa(from: Date, to: Date): { from: Date; to: Date } {
  const dias = Math.max(0, differenceInCalendarDays(to, from)) + 1
  const prevTo = subDays(startOfDay(from), 1)
  const prevFrom = subDays(prevTo, dias - 1)
  return { from: startOfDay(prevFrom), to: endOfDay(prevTo) }
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      ...initial,

      setPreset: (preset) =>
        set((s) => ({
          preset,
          // Si volvemos a un preset pre-definido, limpiamos el custom.
          customFrom: preset === 'personalizado' ? s.customFrom : null,
          customTo:   preset === 'personalizado' ? s.customTo   : null,
        })),

      setCustomRange: (from, to) =>
        set({
          preset: 'personalizado',
          customFrom: from.toISOString().slice(0, 10),
          customTo:   to.toISOString().slice(0, 10),
        }),

      toggleComparativa: () => set((s) => ({ comparativa: !s.comparativa })),

      setHydrated: (v) => set({ isHydrated: v }),

      reset: () => set(initial),
    }),
    {
      name: 'sa-period',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage),
      ),
      partialize: (s) => ({
        preset: s.preset,
        customFrom: s.customFrom,
        customTo: s.customTo,
        comparativa: s.comparativa,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)
