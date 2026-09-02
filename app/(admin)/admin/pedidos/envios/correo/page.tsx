import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { CorreoClient } from './correo-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Envíos por correo' }

const TABS = [
  { label: 'Zonas y tarifas', href: '/admin/pedidos/envios' },
  { label: 'Viajes', href: '/admin/pedidos/envios/viajes' },
  { label: 'Correo', href: '/admin/pedidos/envios/correo' },
]

/**
 * EL BULTO Y LO QUE EL TRANSPORTE TERMINÓ COBRANDO.
 *
 * Lo que NO hay: cotización automática. Eso necesita una cuenta de transporte
 * configurada y no hay ninguna. Lo que sí hay: el peso y las medidas del bulto
 * —para pedir la cotización— y dónde registrar la diferencia cuando el
 * transporte pesa y cobra distinto.
 */
export default async function CorreoPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal'],
  })
  const sb = createClient()

  const { filas: bultos } = await paginar<any>(
    sb.from('pedido_bulto').select('*').eq('forma_entrega', 'correo').order('codigo'),
    { maximo: 2000 },
  )

  const conPeso = bultos.filter((b) => b.peso_gramos !== null).length
  const conDiferencia = bultos.filter(
    (b) => b.envio_costo_real !== null && Number(b.envio_costo_real) !== Number(b.envio_cobrado ?? 0),
  )

  return (
    <>
      <PageHeader
        title="Envíos por correo"
        description="El bulto de cada pedido y lo que el transporte terminó cobrando."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Envíos', href: '/admin/pedidos/envios' }, { label: 'Correo' }]}
        tabs={TABS}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert>
          <AlertDescription className="space-y-1.5 text-xs leading-snug">
            <p>
              <b>La cotización no es automática.</b> No hay ninguna cuenta de transporte configurada
              en NORA. Lo que hay acá es el bulto —peso y unidades— para pedirla, y dónde anotar lo
              que terminó saliendo.
            </p>
            <p>
              <b>Y los pesos son estimados.</b> Vienen de WooCommerce y ninguno está pesado. Si el
              transporte pesa el bulto y cobra distinto, se registra la diferencia acá y queda para
              comparar. Un pedido con algún producto sin peso no muestra un peso parcial: dice
              cuántos le faltan.
            </p>
          </AlertDescription>
        </Alert>

        <CorreoClient bultos={bultos} conPeso={conPeso} conDiferencia={conDiferencia.length} />
      </div>
    </>
  )
}
