import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'

import { OsSubAppsGrid } from '../os-subapps-grid'
import { OsAccionesRapidas } from '../os-acciones-rapidas'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aplicaciones' }

/**
 * LAS 13 APLICACIONES.
 *
 * ── POR QUÉ ESTÁN ACÁ Y NO EN LA HOME ───────────────────────────────────────
 *
 * Porque la home pasó a ser el equipo. No es que las aplicaciones sobren: es
 * que no son lo primero. La capa 3 —listados, filtros, fichas, exportaciones—
 * sirve para ver el conjunto o buscar algo puntual, y eso no es lo que una
 * persona necesita al entrar a la mañana.
 *
 * **Siguen enteras.** Facundo lo pidió explícito: una pestaña más allá, no
 * reemplazadas. Nada de lo que había se tocó.
 */
export default async function AplicacionesPage() {
  await requireAdminHubAccess({})

  return (
    <>
      <PageHeader
        title="Aplicaciones"
        description="Los 13 sectores completos: listados, filtros, fichas y exportaciones."
        breadcrumbs={[{ label: 'Aplicaciones' }]}
      />
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
        <OsAccionesRapidas />
        <OsSubAppsGrid />
      </div>
    </>
  )
}
