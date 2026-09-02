import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import type { ProductoCatalogo } from '@/lib/types/catalogo'
import { PageHeader } from '@/components/shared/page-header'

import { CatalogoClient } from './catalogo-client'
import { lente } from '@/lib/demo/lente'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de productos' }

export default async function CatalogoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })

  const sb = createClient()

  // El total se cuenta EN LA BASE. Contar `data.length` era contar lo que entro
  // en memoria: con `limit(1000)` sobre 46.129 productos, la pantalla decia
  // "1000 de 1000" y no habia forma de notar que faltaban 45.129.
  const { count: total } = await lente(sb
    .from('productos_catalogo').select('id', { count: 'exact', head: true }))

  // TOPE de pantalla, dicho arriba de la tabla. Mandar 46.000 productos al
  // navegador no es una lista: es una descarga.
  const TOPE = 3000
  let error: { message: string } | null = null
  let filas: ProductoCatalogo[] = []
  let truncado = false
  try {
    const r = await paginar<ProductoCatalogo>(
      lente(sb.from('productos_catalogo').select('*').order('nombre', { ascending: true })),
      { maximo: TOPE },
    )
    filas = r.filas
    truncado = r.truncado
  } catch (e: any) {
    error = { message: e?.message ?? 'error' }
  }

  const productos = filas
  const laboratorios = Array.from(
    new Set(productos.map((p) => p.laboratorio).filter(Boolean) as string[]),
  ).sort()

  return (
    <>
      <PageHeader
        title="Catálogo de productos"
        description="Vademécum propio: enriquecé productos y cargá masivamente por CSV."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Catálogo' }]}
      />
      <div className="p-4 md:p-6">
        <CatalogoClient
          productos={productos}
          laboratorios={laboratorios}
          total={total ?? productos.length}
          truncado={truncado}
          loadError={error?.message ?? null}
        />
      </div>
    </>
  )
}
