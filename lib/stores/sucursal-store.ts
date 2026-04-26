import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'
import type { Sucursal } from '@/lib/types/admin'

type SucursalActiva = 'todas' | string

type SucursalState = {
  sucursalActiva: SucursalActiva
  sucursalesDisponibles: Sucursal[]
  isLoading: boolean
  isHydrated: boolean

  setSucursalActiva: (v: SucursalActiva) => void
  loadSucursales: () => Promise<void>
  setHydrated: (v: boolean) => void
  reset: () => void
}

const initial: Omit<SucursalState, 'setSucursalActiva' | 'loadSucursales' | 'setHydrated' | 'reset'> = {
  sucursalActiva: 'todas',
  sucursalesDisponibles: [],
  isLoading: false,
  isHydrated: false,
}

/**
 * Store de sucursal global del ERP.
 *
 * - `sucursalActiva = 'todas'` → consolidado de todas las sucursales.
 * - `sucursalActiva = '<uuid>'` → datos filtrados a esa sucursal.
 *
 * Persiste solo `sucursalActiva` en localStorage (`sa-sucursal-activa`).
 * El catálogo `sucursalesDisponibles` se rehidrata en cliente vía
 * `loadSucursales()`.
 */
export const useSucursalStore = create<SucursalState>()(
  persist(
    (set) => ({
      ...initial,

      setSucursalActiva: (v) => set({ sucursalActiva: v }),

      loadSucursales: async () => {
        set({ isLoading: true })
        const sb = createClient()
        const { data, error } = await sb
          .from('sucursales')
          .select('*')
          .eq('activa', true)
          .order('codigo', { ascending: true })
        if (error) {
          set({ isLoading: false })
          return
        }
        set({
          sucursalesDisponibles: (data ?? []) as Sucursal[],
          isLoading: false,
        })
      },

      setHydrated: (v) => set({ isHydrated: v }),

      reset: () => set(initial),
    }),
    {
      name: 'sa-sucursal-activa',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage),
      ),
      // Solo persistimos la elección del usuario, no el catálogo.
      partialize: (state) => ({ sucursalActiva: state.sucursalActiva }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)
