import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { lente } from '@/lib/demo/lente'

import { ComoPagarClient } from './como-pagar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cómo pagarlo' }

/**
 * LA DECISIÓN 4: CÓMO PAGARLO.
 *
 * La que nadie calcula y la que más plata mueve con inflación. Se cargan las
 * opciones que ofrece el proveedor y se ponen todas en la misma unidad: cuánto
 * vale cada una en pesos de hoy.
 */
export default async function ComoPagarPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'tesoreria', 'administrativo'],
  })
  const sb = createClient()

  const [{ data: tasa }, { data: cajas }, { data: proveedores }, { data: deuda }] = await Promise.all([
    sb.from('compras_parametros').select('valor, que_decide').eq('clave', 'tasa_mensual_pct').maybeSingle(),
    sb.from('caja_general').select('sucursal_id, saldo_actual, tipo, sucursales(nombre)'),
    lente(sb.from('proveedores').select('id, razon_social, plazo_pago_dias, forma_pago_default, descuento_pronto_pago_pct, dia_cobro, trabaja_por_resumen')
      .eq('activo', true).order('razon_social').limit(200)),
    sb.from('deuda_por_proveedor').select('proveedor, saldo, vence_primero').order('saldo', { ascending: false, nullsFirst: false }).limit(50),
  ])

  return (
    <>
      <PageHeader
        title="Cómo pagarlo"
        description="Contado con descuento contra pagar a plazo. Las dos en pesos de hoy."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Cómo pagarlo' }]}
      />
      <div className="p-4 md:p-6">
        <ComoPagarClient
          tasaDefault={Number((tasa as any)?.valor ?? 0)}
          queDecide={(tasa as any)?.que_decide ?? null}
          cajas={(cajas ?? []) as any[]}
          proveedores={(proveedores ?? []) as any[]}
          deuda={(deuda ?? []) as any[]}
        />
      </div>
    </>
  )
}
