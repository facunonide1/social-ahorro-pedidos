import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Densidad = 'compact' | 'normal' | 'comfortable'

export type RecienteEntry = {
  path: string
  label: string
  visitedAt: number
}

const RECIENTES_MAX = 10

type UIState = {
  sidebarCollapsed: boolean
  densidad: Densidad
  favoritos: string[]
  recientes: RecienteEntry[]
  isHydrated: boolean

  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setDensidad: (d: Densidad) => void
  addFavorito: (path: string) => void
  removeFavorito: (path: string) => void
  isFavorito: (path: string) => boolean
  pushReciente: (path: string, label: string) => void
  clearRecientes: () => void
  setHydrated: (v: boolean) => void
}

/**
 * Store de preferencias de UI por usuario, persistente en localStorage.
 *
 * Importante: el toggle de tema (light/dark/system) lo maneja
 * `next-themes`, NO este store.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      densidad: 'normal',
      favoritos: [],
      recientes: [],
      isHydrated: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setDensidad: (d) => set({ densidad: d }),

      addFavorito: (path) =>
        set((s) => (s.favoritos.includes(path) ? s : { favoritos: [...s.favoritos, path] })),

      removeFavorito: (path) =>
        set((s) => ({ favoritos: s.favoritos.filter((p) => p !== path) })),

      isFavorito: (path) => get().favoritos.includes(path),

      pushReciente: (path, label) =>
        set((s) => {
          const filtered = s.recientes.filter((r) => r.path !== path)
          const next: RecienteEntry[] = [{ path, label, visitedAt: Date.now() }, ...filtered].slice(0, RECIENTES_MAX)
          return { recientes: next }
        }),

      clearRecientes: () => set({ recientes: [] }),

      setHydrated: (v) => set({ isHydrated: v }),
    }),
    {
      name: 'sa-ui',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage),
      ),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        densidad: s.densidad,
        favoritos: s.favoritos,
        recientes: s.recientes,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)
