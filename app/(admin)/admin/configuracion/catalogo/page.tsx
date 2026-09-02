import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginaDelCatalogo } from '@/lib/catalogo/pagina'
import { PageHeader } from '@/components/shared/page-header'

import { CatalogoClient } from './catalogo-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de productos' }

/**
 * EL CATÁLOGO, BUSCADO EN LA BASE.
 *
 * Antes traía 3.000 productos de 46.129 y filtraba en el navegador: el que
 * buscaba algo del producto 3.001 en adelante no lo encontraba nunca, y la
 * pantalla no tenía cómo decirle que estaba mirando el 6%.
 */
export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  const sb = createClient()

  const bool = (v?: string) => (v === '1' ? true : v === '0' ? false : null)

  let error: string | null = null
  let pagina
  try {
    pagina = await paginaDelCatalogo(sb, {
      q: searchParams.q,
      categoria: searchParams.categoria,
      laboratorio: searchParams.laboratorio,
      condicion: searchParams.condicion,
      conStock: bool(searchParams.con_stock),
      conOferta: bool(searchParams.con_oferta),
      soloControlados: bool(searchParams.controlados),
      orden: (searchParams.orden as any) ?? 'nombre',
      pagina: Number(searchParams.pagina) || 1,
    })
  } catch (e: any) {
    error = e?.message ?? 'error'
    pagina = { filas: [], total: 0, pagina: 1, porPagina: 50, paginas: 1 }
  }

  // Los laboratorios salen de su propia tabla: sacarlos de los productos de la
  // página daría una lista distinta en cada página.
  const { data: labs } = await sb
    .from('catalogo_laboratorios').select('laboratorio').order('laboratorio').limit(1000)

  return (
    <>
      <PageHeader
        title="Catálogo de productos"
        description="Vademécum propio: enriquecé productos y cargá masivamente por CSV."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Catálogo' }]}
      />
      <div className="p-4 md:p-6">
        <CatalogoClient
          pagina={pagina}
          laboratorios={((labs ?? []) as any[]).map((l) => l.laboratorio).filter(Boolean)}
          loadError={error}
        />
      </div>
    </>
  )
}
