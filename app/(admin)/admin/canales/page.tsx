import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { CanalesClient } from './canales-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Canales de venta' }

/**
 * EL PANEL DEL CANAL.
 *
 * Qué hay publicado, qué no debería estarlo, qué difiere y qué falta. Con el
 * criterio de siempre: lo que no se puede saber, dicho — y lo primero de todo,
 * lo que compromete legalmente.
 */
export default async function CanalesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  const [{ data: canales }, { data: problemas }, { count: publicados }, { count: candidatos }] =
    await Promise.all([
      sb.from('canales_venta').select('*').order('id'),
      sb.from('canal_problemas').select('*').eq('canal_id', 'woo'),
      sb.from('canal_publicaciones').select('externo_id', { count: 'exact', head: true }).eq('canal_id', 'woo'),
      sb.from('canal_candidatos').select('producto_id', { count: 'exact', head: true }),
    ])

  // Los que no deberían estar publicados van completos: son 17 y es lo primero
  // que hay que resolver.
  const { filas: ilegales } = await paginar<any>(
    sb.from('canal_estado').select('sku, producto, condicion_venta, lista_controlado, permalink, estado')
      .eq('canal_id', 'woo').in('problema', ['no_deberia_estar_publicado', 'no_publicable_en_borrador'])
      .order('sku'),
    { maximo: 500 },
  )

  // Los que no cruzan contra el maestro van completos: son pocos y cada uno hay
  // que buscarlo a mano en SIFACO. Ver docs/EL-MAESTRO-ESTA-INCOMPLETO.md.
  const { filas: sinCruce } = await paginar<any>(
    sb.from('canal_estado').select('sku, nombre_canal, estado, permalink, precio_publicado')
      .eq('canal_id', 'woo').eq('problema', 'no_en_catalogo')
      .order('sku'),
    { maximo: 2000 },
  )

  return (
    <>
      <PageHeader
        title="Canales de venta"
        description="Lo que hay publicado en cada canal, contra lo que dice SIFACO. NORA propone; publicar y despublicar lo confirma una persona."
        breadcrumbs={[{ label: 'Canales' }]}
      />
      <div className="p-4 md:p-6">
        <CanalesClient
          canales={(canales ?? []) as any[]}
          problemas={(problemas ?? []) as any[]}
          publicados={publicados ?? 0}
          candidatos={candidatos ?? 0}
          ilegales={ilegales}
          sinCruce={sinCruce}
        />
      </div>
    </>
  )
}
