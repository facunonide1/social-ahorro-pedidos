import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteOperacionesPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/asistente', 'NORA · Asistente')

  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title={tituloDeclarado} description="Cargá vencimientos, iniciá transferencias y consultá stock hablándole a NORA. Siempre confirmás antes."
        breadcrumbs={[{ label: 'Stock' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="stock" />
      </div>
    </>
  )
}
