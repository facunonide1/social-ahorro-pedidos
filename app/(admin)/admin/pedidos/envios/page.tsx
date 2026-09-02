import { Truck, MapPin, Scale, TrendingDown } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FORMA_ENTREGA_LABELS, FORMA_ENTREGA_PENDIENTE, type FormaEntrega } from '@/lib/types'

import { EnviosClient } from './envios-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Envíos' }

const TABS = [
  { label: 'Zonas y tarifas', href: '/admin/pedidos/envios' },
  { label: 'Viajes', href: '/admin/pedidos/envios/viajes' },
  { label: 'Correo', href: '/admin/pedidos/envios/correo' },
]

/**
 * ENVÍOS NO ES UN SECTOR: ES EL TRAMO DE ENTREGA DEL PEDIDO.
 *
 * Por eso vive como pestaña de Pedidos y no como sub-app aparte.
 */
export default async function EnviosPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'auditor'],
  })
  const sb = createClient()

  const [{ data: zonas }, { data: sucursales }, { data: config }, { count: conPeso }, { count: totalCat }] =
    await Promise.all([
      sb.from('envios_por_zona').select('*').order('sucursal', { nullsFirst: false }).order('zona'),
      sb.from('sucursales').select('id, nombre, codigo, es_ecommerce').eq('activa', true).order('codigo'),
      sb.from('envios_config').select('*'),
      sb.from('productos_catalogo').select('id', { count: 'exact', head: true })
        .eq('es_demo', false).not('peso_gramos', 'is', null),
      sb.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_demo', false),
    ])

  const filas = (zonas ?? []) as any[]
  const sinSucursal = filas.filter((z) => !z.sucursal_id).length
  const sinTarifa = filas.filter((z) => z.tarifa === null).length
  const conCosto = filas.filter((z) => z.costo_estimado !== null)
  const pierden = conCosto.filter((z) => Number(z.tarifa ?? 0) < Number(z.costo_estimado))

  return (
    <>
      <PageHeader
        title="Envíos"
        description="El tramo de entrega del pedido: zonas por sucursal, tarifas y viajes. No es un sector aparte."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Envíos' }]}
        tabs={TABS}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Zonas activas" value={filas.length} icon={MapPin} />
          <KpiCard label="Zonas sin sucursal" value={sinSucursal} icon={MapPin}
            variant={sinSucursal > 0 ? 'warning' : 'default'}
            footer={sinSucursal > 0 ? 'La zona 1 de Guzmán no es la de Tesei: hay que decir de cuál sale.' : undefined} />
          {/* Sin el costo de la moto cargado esto no se puede calcular. Un cero
              acá diría «ninguna zona pierde plata», que es una afirmación. */}
          <KpiCard label="Zonas que pierden plata" icon={TrendingDown}
            value={conCosto.length === 0 ? null : pierden.length}
            variant={pierden.length > 0 ? 'danger' : 'default'}
            nota={conCosto.length === 0
              ? 'No se puede calcular: falta el costo de la moto por km y por hora, y los km de cada zona.'
              : undefined} />
          <KpiCard label="Productos con peso cargado" value={conPeso ?? 0} icon={Scale}
            footer={`de ${(totalCat ?? 0).toLocaleString('es-AR')} · todos estimados, ninguno pesado`} />
        </div>

        <Alert>
          <AlertDescription className="space-y-1.5 text-xs leading-snug">
            <p>
              <b>El costo de un envío es estimado.</b> Sale de los km y los minutos que alguien
              declaró para la zona, por el costo por km y por hora de la sucursal. Nadie mide el
              recorrido: mientras falte cualquiera de esos cuatro números, la zona no dice que
              pierde ni que gana — dice qué falta.
            </p>
            <p>
              <b>Y el peso de los productos también.</b> Los {(conPeso ?? 0).toLocaleString('es-AR')} pesos
              que hay vienen de WooCommerce y son estimaciones, no pesadas. Si el transporte pesa el
              bulto y cobra distinto, se registra en el pedido y se compara.
            </p>
          </AlertDescription>
        </Alert>

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Las cinco formas de entrega
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(FORMA_ENTREGA_LABELS) as FormaEntrega[]).map((f) => (
              <div key={f} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Truck className="size-4 text-muted-foreground" /> {FORMA_ENTREGA_LABELS[f]}
                </div>
                {FORMA_ENTREGA_PENDIENTE[f] && (
                  <p className="mt-1 text-xs text-muted-foreground">{FORMA_ENTREGA_PENDIENTE[f]}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <EnviosClient
          zonas={filas}
          sucursales={(sucursales ?? []) as any[]}
          config={(config ?? []) as any[]}
          sinTarifa={sinTarifa}
        />
      </div>
    </>
  )
}
