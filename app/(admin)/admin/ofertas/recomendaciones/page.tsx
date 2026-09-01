import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { RecomendacionesClient } from './recomendaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Qué conviene hacer' }

/**
 * QUÉ CONVIENE HACER CON LAS OFERTAS Y CON LAS COMPRAS.
 *
 * NORA propone y muestra el cálculo. Publicar una oferta sigue pasando por el
 * ciclo de aprobación (regla de oro 4), y corregir un descuento se hace en
 * SIFACO, por una persona (regla de oro 1).
 *
 * Las reglas que hoy NO se pueden correr por falta de datos están escritas y
 * apagadas, con el dato que les falta a la vista. No se simulan.
 */
export default async function RecomendacionesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  const [{ data: reglas }, { data: resumenOfertas }, { data: urgencias }, { data: global }, { data: medicion }, { data: ultima }] =
    await Promise.all([
      sb.from('reglas_recomendacion').select('*').order('orden'),
      sb.from('reco_ofertas_resumen').select('*'),
      sb.from('reco_compras_urgencia').select('*'),
      sb.from('compras_global').select('*').maybeSingle(),
      sb.from('ofertas_medicion_resumen').select('*'),
      sb.from('sifaco_importaciones')
        .select('fecha_archivo').eq('tipo', 'ofertas').eq('estado', 'cargado')
        .order('cargado_at', { ascending: false }).limit(1).maybeSingle(),
    ])

  // Las filas para exportar. Con tope y paginadas de verdad.
  const [sacar, comprar] = await Promise.all([
    paginar<any>(sb.from('reco_ofertas').select('*').order('plata_por_mes', { ascending: false }), { maximo: 4000 }),
    paginar<any>(sb.from('reco_compras').select('*').not('urgencia', 'is', null).order('costo_sugerido', { ascending: false }), { maximo: 6000 }),
  ])

  return (
    <>
      <PageHeader
        title="Qué conviene hacer"
        description="NORA muestra el cálculo; la decisión es de una persona. Los descuentos se corrigen en SIFACO."
        breadcrumbs={[{ label: 'Ofertas' }, { label: 'Recomendaciones' }]}
      />
      <div className="p-4 md:p-6">
        <RecomendacionesClient
          reglas={(reglas ?? []) as any[]}
          resumenOfertas={(resumenOfertas ?? []) as any[]}
          urgencias={(urgencias ?? []) as any[]}
          global={global as any}
          medicion={(medicion ?? []) as any[]}
          ofertas={sacar.filas}
          compras={comprar.filas}
          fechaDato={(ultima as any)?.fecha_archivo ?? null}
        />
      </div>
    </>
  )
}
