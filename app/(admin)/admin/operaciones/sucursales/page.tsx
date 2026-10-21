import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { edadDelDato } from '@/lib/sifaco/edad-del-dato.server'
import { PageHeader } from '@/components/shared/page-header'

import { SucursalesClient } from './sucursales-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparar sucursales' }

/**
 * COMPARAR LAS CUATRO SUCURSALES.
 *
 * ── POR QUÉ ESTA PANTALLA NO EXISTÍA ────────────────────────────────────────
 *
 * Porque no se podía. El maestro traía el stock en una sola columna y las
 * ventas en una sola columna: la cadena entera, sin abrir. Comparar locales con
 * eso habría sido repartir el total entre cuatro, que es inventar.
 *
 * Es lo que Facundo hace a mano antes de comprar, y ahora hay con qué.
 *
 * ── LO QUE CONTESTA, EN ESTE ORDEN ──────────────────────────────────────────
 *
 * 1. Qué tiene y qué vende cada una, con los dos porcentajes al lado. La
 *    diferencia entre «tengo el 57% del stock» y «vendo el 73%» es plata en el
 *    lugar equivocado, y es el número más grande de la pantalla.
 * 2. Lo mal repartido producto por producto: está acá quieto y allá se pide.
 * 3. Los que el archivo marca de baja y todavía tienen mercadería encima.
 */
export default async function SucursalesPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'encargado_sucursal', 'auditor'],
  })
  const sb = createClient()

  const [{ data: comparar }, edad] = await Promise.all([
    sb.from('comparar_sucursales').select('*').order('valor_costo', { ascending: false }),
    edadDelDato(),
  ])

  // Lo mal repartido va completo: son 693 filas y cada una es una decisión de
  // transferir. Con `paginar` porque PostgREST corta en 1000 sin avisar.
  const { filas: malRepartido } = await paginar<any>(
    sb.from('stock_mal_repartido').select('*').order('plata_quieta', { ascending: false }),
    { maximo: 5000 },
  )

  const { filas: deBaja } = await paginar<any>(
    sb.from('productos_marcados_de_baja').select('*').order('plata', { ascending: false }),
    { maximo: 2000 },
  )

  return (
    <>
      <PageHeader
        title="Comparar sucursales"
        description="Qué tiene y qué vende cada local, y qué está en el lugar equivocado. Del archivo por sucursal de SIFACO."
        breadcrumbs={[{ label: 'Operaciones', href: '/admin/operaciones' }, { label: 'Sucursales' }]}
      />
      <div className="p-4 md:p-6">
        <SucursalesClient
          comparar={(comparar ?? []) as any[]}
          malRepartido={malRepartido}
          deBaja={deBaja}
          edad={edad}
        />
      </div>
    </>
  )
}
