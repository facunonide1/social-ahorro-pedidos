import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { CargarVencimientosClient } from './cargar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cargar vencimientos' }

/**
 * C.1 · CARGAR VENCIMIENTOS, PARADO EN EL DEPÓSITO.
 *
 * ── EL ÚNICO HUECO DEL DÍA DEL ENCARGADO ────────────────────────────────────
 *
 * La verificación de la v0.98 dio los diez pasos en verde salvo éste: la tarea
 * diaria aparecía pero la carga se hacía en una pantalla de escritorio.
 *
 * Esto es lo contrario: pocos campos, botones grandes, el producto se
 * identifica escaneando el código de barras, y se pueden cargar varios lotes
 * del mismo producto seguidos sin volver a buscarlo.
 */
export default async function CargarVencimientosPage() {
  const yo = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'encargado_sucursal', 'sucursal', 'empleado_general', 'administrativo'],
  })
  const sb = createClient()

  const [{ data: avance }, { data: sucs }] = await Promise.all([
    sb.rpc('vencimientos_avance', { p_sucursal: yo.sucursal_id }).maybeSingle(),
    sb.from('sucursales').select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo'),
  ])

  // C.3 · los 200 que más conviene cargar. Con `paginar` porque la vista tiene
  // miles de filas y PostgREST corta en 1000 sin avisar.
  const { filas: lista } = await paginar<any>(
    sb.from('vencimientos_a_cargar').select('*')
      .eq('ya_cargado', false)
      .order('prioridad', { ascending: false }),
    { maximo: 200 },
  )

  return (
    <>
      <PageHeader
        title="Cargar vencimientos"
        description="Escaneá el producto y cargá la fecha. Se hace parado donde está la mercadería."
        breadcrumbs={[
          { label: 'Operaciones', href: '/admin/operaciones' },
          { label: 'Vencimientos', href: '/admin/operaciones/vencimientos' },
          { label: 'Cargar' },
        ]}
      />
      <div className="p-4 md:p-6">
        <CargarVencimientosClient
          avance={avance as any}
          lista={lista.slice(0, 200)}
          sucursales={(sucs ?? []) as any[]}
          miSucursal={yo.sucursal_id ?? null}
        />
      </div>
    </>
  )
}
