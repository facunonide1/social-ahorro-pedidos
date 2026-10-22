import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ControlCajaClient } from './control-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Control de caja' }

/**
 * EL CONTROL DE CAJA.
 *
 * ── DE DÓNDE SALE ESTA PANTALLA ─────────────────────────────────────────────
 *
 * Del pedido textual de Facundo: «yo enviándole archivo de tickets y ventas y
 * hacer el control de si los ingresos están bien y marcarme posibles
 * diferencias».
 *
 * El circuito de hoy es: foto del cierre de SIFACO, totales a un Drive, de ahí
 * salen los retiros, y administración verifica contra las ventas y los tickets.
 * El último paso se hacía a mano o no se hacía. Es donde está la plata sin
 * controlar.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ────────────────────────────────────────────
 *
 * No acusa. Dice que hay una diferencia de $X en tal cierre, con el turno y
 * quién cerró —para poder ir a preguntar— y el motivo lo escribe una persona.
 * Una diferencia de caja tiene diez explicaciones y nueve son inocentes.
 */
export default async function ControlCajaPage() {
  const yo = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'encargado_sucursal', 'sucursal', 'auditor'],
  })
  const sb = createClient()

  const [{ data: sucursales }, { data: config }] = await Promise.all([
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true)
      .eq('es_ecommerce', false).order('codigo'),
    sb.from('config_caja_sucursal').select('sucursal_id, tope_efectivo, fondo_fijo'),
  ])

  // Las diferencias abiertas, que son lo primero que hay que ver al entrar.
  // La RLS ya las filtra por sucursal: un encargado ve las suyas.
  const { data: abiertas } = await sb
    .from('caja_diferencias').select('*')
    .eq('estado', 'abierta')
    .order('fecha', { ascending: false }).limit(100)

  return (
    <>
      <PageHeader
        title="Control de caja"
        description="Los cierres del día contra los tickets y las ventas. NORA marca las diferencias; el motivo lo pone una persona."
        breadcrumbs={[{ label: 'Finanzas', href: '/admin/finanzas' }, { label: 'Caja', href: '/admin/finanzas/caja' }, { label: 'Control' }]}
      />
      <div className="p-4 md:p-6">
        <ControlCajaClient
          sucursales={(sucursales ?? []) as any[]}
          config={(config ?? []) as any[]}
          abiertas={(abiertas ?? []) as any[]}
          // Un encargado tiene sucursal asignada y controla la suya. Un dueño no
          // tiene, y elige.
          miSucursal={yo.sucursal_id ?? null}
          rol={yo.rol}
        />
      </div>
    </>
  )
}
