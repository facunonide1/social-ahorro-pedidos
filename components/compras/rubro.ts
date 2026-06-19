/**
 * Rubros del sector Compras — módulo plano (server-safe).
 *
 * `parseRubro` y `RUBROS` se usan tanto en Server Components (páginas índice de
 * Compras) como en el client component `RubroFilter`. Por eso viven acá, fuera
 * de un archivo `'use client'`: si estuvieran en el módulo del componente
 * cliente, importarlos desde un Server Component los convertiría en una
 * referencia de cliente y llamarlos server-side tiraría
 * "TypeError: (0, X) is not a function".
 */

export const RUBROS = [
  { v: 'todos', l: 'Todos' },
  { v: 'farmacia', l: 'Farmacia' },
  { v: 'perfumeria', l: 'Perfumería' },
  { v: 'supermercado', l: 'Súper' },
  { v: 'servicios', l: 'Servicios' },
] as const

export type Rubro = (typeof RUBROS)[number]['v']

/** Normaliza el searchParam ?rubro a un rubro válido (default 'todos'). */
export function parseRubro(v: string | undefined | null): Rubro {
  return (RUBROS.find((r) => r.v === v)?.v ?? 'todos') as Rubro
}
