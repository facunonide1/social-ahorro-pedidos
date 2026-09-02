import { Package, MapPin, MessageSquare, PenLine } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'

import { TableroClient } from './tablero-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tablero de pedidos' }

const ABIERTOS = ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino']

/**
 * LOS CUATRO CANALES JUNTOS, POR ESTADO.
 *
 * El canal es una etiqueta, no una columna: un pedido de WhatsApp y uno de la
 * web están en la misma fila de «listo» porque son la misma cosa.
 */
export default async function TableroPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero', 'auditor'],
  })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let pedidosQ = sb.from('pedidos_unificados')
    .select('*').in('status', ABIERTOS).order('created_at', { ascending: false })
  if (!esTodas && sucursalId) pedidosQ = pedidosQ.eq('sucursal_id', sucursalId)

  const [{ filas: pedidos }, { data: sucursales }, { filas: avisos }] = await Promise.all([
    paginar<any>(pedidosQ, { maximo: 2000 }),
    sb.from('sucursales').select('id, nombre, codigo, es_ecommerce').eq('activa', true).order('codigo'),
    paginar<any>(
      sb.from('avisos_al_cliente').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      { maximo: 1000 },
    ),
  ])

  const sinSucursal = pedidos.filter((p) => !p.sucursal_id).length
  const esperandoFirma = avisos.filter((a) => a.requiere_firma && !a.firmado_at).length
  const listosParaMandar = avisos.filter((a) => !a.requiere_firma || a.firmado_at).length

  return (
    <>
      <PageHeader
        title="Tablero de pedidos"
        description="WhatsApp, tienda web, PedidosYa y mostrador, por estado. El canal es una etiqueta."
        breadcrumbs={[{ label: 'Pedidos', href: '/admin/pedidos' }, { label: 'Tablero' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Pedidos abiertos" value={pedidos.length} icon={Package} />
          <KpiCard label="Sin sucursal" value={sinSucursal} icon={MapPin}
            variant={sinSucursal > 0 ? 'warning' : 'default'}
            footer={sinSucursal > 0 ? 'Hay que elegirla: no se deduce del stock.' : undefined} />
          <KpiCard label="Avisos esperando firma" value={esperandoFirma} icon={PenLine}
            variant={esperandoFirma > 0 ? 'warning' : 'default'}
            footer={esperandoFirma > 0 ? 'Prometen una hora o piden disculpas.' : undefined} />
          <KpiCard label="Avisos listos para copiar" value={listosParaMandar} icon={MessageSquare}
            footer="WhatsApp no está integrado: los manda una persona." />
        </div>

        <TableroClient
          pedidos={pedidos}
          avisos={avisos}
          sucursales={(sucursales ?? []) as any[]}
        />
      </div>
    </>
  )
}
