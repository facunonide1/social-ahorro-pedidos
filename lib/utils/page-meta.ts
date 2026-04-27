import type { Metadata } from 'next'

/**
 * Helper para generar `metadata` de una página del ERP. Mantiene el
 * sufijo "Social Ahorro" consistente y un fallback razonable de
 * description si no se pasa una.
 *
 * @example
 *   // app/(admin)/admin/compras/proveedores/page.tsx
 *   export const metadata = pageMeta({
 *     title: 'Proveedores',
 *     description: 'Maestro de proveedores',
 *   })
 */
export function pageMeta({
  title,
  description,
}: {
  title: string
  description?: string
}): Metadata {
  return {
    title: `${title} · Social Ahorro`,
    description: description ?? `${title} en el panel de Social Ahorro`,
  }
}
