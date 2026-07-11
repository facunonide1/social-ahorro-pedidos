'use client'

/**
 * NORA OS · hook del selector de sucursal global.
 *
 * Alias ergonómico sobre `useSucursal()` (que envuelve `sucursal-store`), con el
 * nombre que adoptan los sectores gradualmente. En esta sesión NO se migran los
 * selectores internos: solo se deja el global funcionando y este hook listo.
 *
 *   const { sucursalActiva, isAllSucursales, sucursalActivaData, setSucursalActiva } = useSucursalGlobal()
 */
export { useSucursal as useSucursalGlobal } from '@/lib/hooks/use-sucursal'
