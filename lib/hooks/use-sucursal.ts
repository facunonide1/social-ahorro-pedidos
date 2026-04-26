'use client'

import { useEffect, useMemo } from 'react'
import { useSucursalStore } from '@/lib/stores/sucursal-store'
import type { Sucursal } from '@/lib/types/admin'

/**
 * Hook ergonómico sobre `sucursal-store`.
 *
 * Carga el catálogo de sucursales en el primer mount del cliente
 * (después de la rehidratación), y expone helpers para filtrar queries.
 *
 * @example
 *   const { sucursalActiva, isAllSucursales, sucursalActivaData } = useSucursal()
 *   if (!isAllSucursales) {
 *     query = query.eq('sucursal_id', sucursalActiva)
 *   }
 */
export function useSucursal() {
  const sucursalActiva     = useSucursalStore((s) => s.sucursalActiva)
  const sucursalesDispon   = useSucursalStore((s) => s.sucursalesDisponibles)
  const isLoading          = useSucursalStore((s) => s.isLoading)
  const isHydrated         = useSucursalStore((s) => s.isHydrated)
  const setSucursalActiva  = useSucursalStore((s) => s.setSucursalActiva)
  const loadSucursales     = useSucursalStore((s) => s.loadSucursales)

  // Lazy-load del catálogo. Solo después de hidratar.
  useEffect(() => {
    if (isHydrated && sucursalesDispon.length === 0 && !isLoading) {
      loadSucursales()
    }
  }, [isHydrated, sucursalesDispon.length, isLoading, loadSucursales])

  const isAllSucursales = sucursalActiva === 'todas'

  const sucursalActivaData: Sucursal | null = useMemo(
    () =>
      isAllSucursales
        ? null
        : sucursalesDispon.find((s) => s.id === sucursalActiva) ?? null,
    [sucursalActiva, sucursalesDispon, isAllSucursales],
  )

  /**
   * Builder de filtro para queries que tienen `sucursal_id`.
   * Aplicar como: `query.match(useSucursal().buildFilter())`
   */
  const buildFilter = (): { sucursal_id?: string } => {
    if (isAllSucursales) return {}
    return { sucursal_id: sucursalActiva }
  }

  return {
    sucursalActiva,
    sucursalesDisponibles: sucursalesDispon,
    sucursalActivaData,
    isAllSucursales,
    isLoading,
    isHydrated,
    setSucursalActiva,
    loadSucursales,
    buildFilter,
  }
}
