import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { OfertasSifacoClient } from './ofertas-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ofertas de SIFACO' }

/**
 * LAS OFERTAS QUE DECLARA SIFACO.
 *
 * ── POR QUÉ LA BÚSQUEDA VA EN EL SERVIDOR ───────────────────────────────────
 *
 * Son 16.383 filas. Traerlas al navegador para filtrarlas ahí no es una tabla:
 * es una descarga, y además se corta en mil sin avisar. Ésta era una de las
 * cuatro pantallas que v0.85 dejó marcadas como «hay que repensar»; acá se
 * repiensa.
 *
 * ── LO PRIMERO QUE SE VE ────────────────────────────────────────────────────
 *
 * Los tres grupos del cruce contra rotación, arriba de todo. El número que
 * importa es que **$49,2 M por mes se entregan en productos que se venderían
 * igual**. Estaba calculado desde v0.84 y no se veía en ningún lado.
 */
export default async function OfertasSifacoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  const [{ data: grupos }, { data: vigencias }, { data: ultima }] = await Promise.all([
    sb.from('ofertas_por_rotacion').select('*'),
    sb.from('ofertas_por_vigencia').select('*'),
    sb.from('sifaco_importaciones')
      .select('archivo_nombre, fecha_archivo, cargado_at')
      .eq('tipo', 'ofertas').eq('estado', 'cargado')
      .order('cargado_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return (
    <>
      <PageHeader
        title="Ofertas de SIFACO"
        description="Las que declara SIFACO. NORA las refleja y no las modifica: los descuentos se corrigen allá, por una persona."
        breadcrumbs={[{ label: 'Ofertas' }, { label: 'De SIFACO' }]}
      />
      <div className="p-4 md:p-6">
        <OfertasSifacoClient
          grupos={(grupos ?? []) as any[]}
          vigencias={(vigencias ?? []) as any[]}
          ultimaImportacion={(ultima ?? null) as any}
        />
      </div>
    </>
  )
}
