import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'

import ProductoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoProductoPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/stock/nuevo', 'Nuevo producto')

  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })

  return (
    <>
      <PageHeader
        title={tituloDeclarado}
        breadcrumbs={[
          { label: 'Stock', href: '/admin/operaciones/stock' },
          { label: 'Nuevo' },
        ]}
      />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <ProductoForm mode="create" />
      </div>
    </>
  )
}
