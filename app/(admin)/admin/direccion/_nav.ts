import type { PageHeaderTab } from '@/components/shared/page-header'

/**
 * LA SUB-APP DE DIRECCIÓN.
 *
 * Tres pantallas, y una sola razón para que sean tres: el tablero es para
 * mirar cinco minutos, la comparación entre sucursales es para sentarse, y la
 * bandeja es para trabajar. Juntas en una, la primera se vuelve ilegible.
 */
export const TABS_DIRECCION: PageHeaderTab[] = [
  { label: 'Tablero', href: '/admin/direccion' },
  { label: 'Sucursales', href: '/admin/direccion/sucursales' },
  { label: 'Lo que espera', href: '/admin/direccion/bandeja' },
]
