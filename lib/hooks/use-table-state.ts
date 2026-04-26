'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQueryStates, parseAsString, parseAsInteger, parseAsJson } from 'nuqs'
import { useUIStore, type Densidad } from '@/lib/stores/ui-store'

export type SortState = { id: string; desc: boolean } | null
export type FiltersState = Record<string, unknown>

export type SavedView = {
  id: string
  name: string
  search: string
  sort: SortState
  filters: FiltersState
  pageSize: number
  columnVisibility: Record<string, boolean>
  columnOrder: string[]
  density: Densidad
  createdAt: number
}

export type TableStateDefaults = {
  search?: string
  sort?: SortState
  filters?: FiltersState
  page?: number
  pageSize?: number
  columnVisibility?: Record<string, boolean>
  columnOrder?: string[]
}

/**
 * Estado de tabla profesional con persistencia mixta:
 *
 * - **URL** (compartible): search, sort, filters, page, pageSize.
 * - **localStorage** (preferencias personales): columnVisibility,
 *   columnOrder, density, savedViews.
 *
 * Cada tabla se identifica con un `key` único (ej `'proveedores-list'`).
 * Las saved views guardan filtros + sort + density + columnas, todo
 * de un saque.
 *
 * Requiere `<NuqsAdapter>` en el árbol (ya montado en `app/layout.tsx`).
 *
 * @example
 *   const t = useTableState('proveedores-list')
 *   t.setSearch('acme')
 *   t.setFilter('categoria', 'Limpieza')
 *   t.saveView('Limpieza activos')
 */
export function useTableState(key: string, defaults: TableStateDefaults = {}) {
  const [urlState, setUrlState] = useQueryStates(
    {
      q:    parseAsString.withDefault(defaults.search ?? ''),
      sort: parseAsString.withDefault(serializeSort(defaults.sort ?? null)),
      page: parseAsInteger.withDefault(defaults.page ?? 1),
      ps:   parseAsInteger.withDefault(defaults.pageSize ?? 25),
      f:    parseAsJson<FiltersState>((v) => (v as FiltersState | null) ?? {}).withDefault(defaults.filters ?? {}),
    },
    { history: 'replace' },
  )

  const [columnVisibility, setColumnVisibility] = useLocalState<Record<string, boolean>>(
    `sa-table-${key}-cols`,
    defaults.columnVisibility ?? {},
  )
  const [columnOrder, setColumnOrder] = useLocalState<string[]>(
    `sa-table-${key}-order`,
    defaults.columnOrder ?? [],
  )
  const [savedViews, setSavedViews] = useLocalState<SavedView[]>(
    `sa-table-${key}-views`,
    [],
  )

  const density    = useUIStore((s) => s.densidad)
  const setDensidad = useUIStore((s) => s.setDensidad)

  const setSearch    = useCallback((q: string) => setUrlState({ q, page: 1 }), [setUrlState])
  const setSort      = useCallback((s: SortState) => setUrlState({ sort: serializeSort(s) }), [setUrlState])
  const setPage      = useCallback((p: number) => setUrlState({ page: p }), [setUrlState])
  const setPageSize  = useCallback((ps: number) => setUrlState({ ps, page: 1 }), [setUrlState])
  const setFilter    = useCallback(
    (k: string, v: unknown) =>
      setUrlState((prev) => ({
        f: { ...((prev.f as FiltersState) ?? {}), [k]: v },
        page: 1,
      })),
    [setUrlState],
  )
  const clearFilters = useCallback(() => setUrlState({ f: {}, page: 1 }), [setUrlState])

  const saveView = useCallback(
    (name: string) => {
      const view: SavedView = {
        id: crypto.randomUUID(),
        name,
        search: urlState.q,
        sort: parseSort(urlState.sort),
        filters: urlState.f,
        pageSize: urlState.ps,
        columnVisibility,
        columnOrder,
        density,
        createdAt: Date.now(),
      }
      setSavedViews([...savedViews, view])
      return view.id
    },
    [urlState, columnVisibility, columnOrder, density, savedViews, setSavedViews],
  )

  const loadView = useCallback(
    (id: string) => {
      const v = savedViews.find((x) => x.id === id)
      if (!v) return
      setUrlState({
        q: v.search,
        sort: serializeSort(v.sort),
        f: v.filters,
        ps: v.pageSize,
        page: 1,
      })
      setColumnVisibility(v.columnVisibility)
      setColumnOrder(v.columnOrder)
      setDensidad(v.density)
    },
    [savedViews, setUrlState, setColumnVisibility, setColumnOrder, setDensidad],
  )

  const deleteView = useCallback(
    (id: string) => setSavedViews(savedViews.filter((v) => v.id !== id)),
    [savedViews, setSavedViews],
  )

  return {
    // URL state
    search: urlState.q,
    setSearch,
    sort: parseSort(urlState.sort),
    setSort,
    page: urlState.page,
    setPage,
    pageSize: urlState.ps,
    setPageSize,
    filters: urlState.f,
    setFilter,
    clearFilters,
    // Persistencia personal
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    density,
    setDensidad,
    // Vistas
    savedViews,
    saveView,
    loadView,
    deleteView,
  }
}

/* ---------- helpers ---------- */

function useLocalState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValueState] = useState<T>(defaultValue)

  // Hidratamos en cliente. Si no hay nada guardado, queda el default.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(key)
      if (raw != null) setValueState(JSON.parse(raw) as T)
    } catch {
      /* JSON inválido → default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const setValue = useCallback((next: T) => {
    setValueState(next)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* quota exceeded → ignoramos, está en memoria igual */
    }
  }, [key])

  return [value, setValue]
}

function serializeSort(s: SortState): string {
  if (!s) return ''
  return `${s.id}:${s.desc ? 'desc' : 'asc'}`
}
function parseSort(raw: string): SortState {
  if (!raw) return null
  const [id, dir] = raw.split(':')
  if (!id) return null
  return { id, desc: dir === 'desc' }
}
