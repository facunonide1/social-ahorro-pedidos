import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { AnomaliasClient } from './anomalias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lo que está roto en SIFACO' }

const TOPE = 3000

/**
 * LO QUE ESTÁ ROTO EN SIFACO.
 *
 * NORA no corrige nada: detecta, ordena por plata en juego y hace seguimiento.
 * La corrección se hace en SIFACO, por una persona (regla de oro 1).
 *
 * Ordenado por PLATA, no por cantidad: un descuento bajo costo sobre algo que
 * vende 254 unidades al mes importa más que doscientos productos sin costo que
 * no vende nadie.
 */
export default async function AnomaliasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  // Los totales se cuentan EN LA BASE (docs/CONSULTAS-QUE-NO-MIENTEN.md).
  const [{ count: total }, { count: abiertas }, { data: porTipo }, { count: importaciones }] = await Promise.all([
    sb.from('anomalias').select('id', { count: 'exact', head: true }),
    sb.from('anomalias').select('id', { count: 'exact', head: true }).in('estado', ['abierta', 'reaparecio']),
    sb.from('anomalias_por_tipo').select('*'),
    sb.from('sifaco_importaciones').select('id', { count: 'exact', head: true }).eq('estado', 'cargado'),
  ])

  const { filas, truncado } = await paginar<any>(
    sb.from('anomalias')
      .select('id, tipo, clave, estado, plata_en_juego, evidencia, veces_reaparecio, primera_vez, motivo')
      .in('estado', ['abierta', 'reaparecio', 'en_curso'])
      .order('plata_en_juego', { ascending: false })
      .order('id'),
    { maximo: TOPE },
  )

  return (
    <>
      <PageHeader
        title="Lo que está roto en SIFACO"
        description="NORA lo detecta y hace seguimiento. La corrección se hace en SIFACO, por una persona: acá no se cambia ningún precio ni se da de baja ningún producto."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Anomalías' }]}
      />
      <div className="p-4 md:p-6">
        <AnomaliasClient
          filas={filas}
          porTipo={(porTipo ?? []) as any[]}
          total={total ?? 0}
          abiertas={abiertas ?? 0}
          truncado={truncado}
          mostrados={filas.length}
          huboImportacion={(importaciones ?? 0) > 0}
        />
      </div>
    </>
  )
}
