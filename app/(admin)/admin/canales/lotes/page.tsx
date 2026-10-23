import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { lotes as leerLotes, itemsDeLote, type LoteItem } from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'
import { LotesClient } from './lotes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lotes de publicar y despublicar' }

/**
 * A.4 · PUBLICAR Y DESPUBLICAR EN LOTE.
 *
 * La firma ya existía desde la v1.4: `canal_lote_armar` deja el lote en
 * borrador y `canal_lote_firmar` lo cierra con `auth.uid()`. Lo que no existía
 * era el lugar donde mirarlo antes de firmar — y un lote que se firma sin
 * poder revisarlo renglón por renglón es un lote que se firma a ciegas.
 */
export default async function LotesPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const lotes = await leerLotes(adm, 50)

  // Los renglones de cada lote. Son pocos lotes y la pantalla los necesita para
  // poder revisar antes de firmar: traerlos de a uno al abrir obligaría a un
  // ida y vuelta por lote.
  const items: Record<string, LoteItem[]> = {}
  for (const l of lotes ?? []) {
    items[l.id] = (await itemsDeLote(adm, l.id)) ?? []
  }

  return (
    <>
      <PageHeader
        title="Lotes de publicar y despublicar"
        description="Se arman, se revisan, se firman y se exportan. NORA no publica: carga una persona."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Lotes' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-4 p-4 md:p-6">
        <LotesClient lotes={lotes} items={items} />
        <p className="rounded-lg border border-dashed p-4 text-[11px] leading-snug text-muted-foreground">
          <b>Ningún lote se publica solo.</b> NORA no tiene credenciales de escritura en PedidosYa
          ni en WooCommerce, y eso no es una limitación pendiente de resolver: es la regla. El lote
          firmado sale en .xlsx con el SKU y lo carga una persona en el portal.
        </p>
      </div>
    </>
  )
}
